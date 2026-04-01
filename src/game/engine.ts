import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CONFIG } from "./config";
import { createBoard, toWorldX, toWorldY } from "./board";
import type { ActiveBall, GameUI, GateSensor, GameConfig } from "./types";

interface EngineDeps {
  canvas: HTMLCanvasElement;
  backgroundCanvas: HTMLCanvasElement;
  ui: GameUI;
  config?: GameConfig;
}

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly backgroundCanvas: HTMLCanvasElement;
  private readonly backgroundCtx: CanvasRenderingContext2D;
  private readonly ui: GameUI;
  private readonly config: GameConfig;
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private gateSensors: GateSensor[] = [];
  private ballCount: number;
  private activeBalls: ActiveBall[] = [];
  private isGameOver = false;
  private isLightStopped = false;
  private activeGateIndex = 0;
  private lightIndex = 0;
  private lightDirection = 1;
  private lastLightUpdate = 0;
  private lastTickTime = 0;
  private accumulator = 0;
  private rafId = 0;
  private pointer = { x: 0, y: 0, active: false };
  private hexGlowLevels = new Float32Array(0);
  private hexLayout = {
    cols: 0,
    rows: 0,
    size: 28,
    hStep: 0,
    vStep: 0,
  };

  constructor({ canvas, backgroundCanvas, ui, config = CONFIG }: EngineDeps) {
    this.canvas = canvas;
    this.backgroundCanvas = backgroundCanvas;
    this.ui = ui;
    this.config = config;
    this.ballCount = config.initialBalls;
    const bgCtx = backgroundCanvas.getContext("2d");
    if (!bgCtx) throw new Error("Unable to create background rendering context.");
    this.backgroundCtx = bgCtx;
    this.scene = new THREE.Scene();

    const boardWidth = this.config.logicalWidth / this.config.scale;
    const boardHeight = this.config.logicalHeight / this.config.scale;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 240);
    this.camera.position.set(boardWidth / 2, boardHeight / 2 + 4.5, 86);
    this.camera.lookAt(boardWidth / 2, boardHeight / 2 - 2.5, -2);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    const ambientLight = new THREE.AmbientLight(0x5a6a85, 0.55);
    const keyLight = new THREE.DirectionalLight(0x9cecff, 0.9);
    keyLight.position.set(20, 90, 70);
    const fillLight = new THREE.PointLight(0xccff00, 1.8, 130);
    fillLight.position.set(25, 35, 35);
    this.scene.add(ambientLight, keyLight, fillLight);

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerleave", this.handlePointerLeave);
  }

  public async start(): Promise<void> {
    await this.initPhysics();
    this.resizeCanvas();
    this.ui.updateLives(this.ballCount);
    this.ui.setIndicator("red");
    this.ui.setButtons(true, false);
    this.tick = this.tick.bind(this);
    this.lastTickTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerleave", this.handlePointerLeave);
  }

  public resizeCanvas(): void {
    const board = this.canvas.parentElement;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    const boardWidth = this.config.logicalWidth / this.config.scale;
    const boardHeight = this.config.logicalHeight / this.config.scale;
    this.camera.aspect = rect.width / rect.height;
    this.camera.position.x = boardWidth / 2;
    this.camera.position.y = boardHeight / 2 + 4.5;
    this.camera.position.z = 86;
    this.camera.lookAt(boardWidth / 2, boardHeight / 2 - 2.5, -2);
    this.camera.updateProjectionMatrix();
    this.resizeBackgroundCanvas();
  }

  public stopLight(): void {
    if (this.isLightStopped || this.isGameOver || this.activeBalls.length > 0) return;
    this.isLightStopped = true;
    this.activeGateIndex = this.lightIndex;
    this.ui.setIndicator("green");
    this.ui.setButtons(false, true);
  }

  public shootBall(): void {
    if (!this.world) return;
    if (this.ballCount <= 0 || this.isGameOver || !this.isLightStopped || this.activeBalls.length > 0) {
      return;
    }
    this.ballCount -= 1;
    this.ui.updateLives(this.ballCount);
    this.ui.setButtons(false, false);

    const radius = this.config.ballRadius / this.config.scale;
    const spawnX = toWorldX(this.config, this.config.logicalWidth - this.config.tunnelWidth / 2);
    const spawnY = toWorldY(this.config, this.config.logicalHeight - 40);

    const ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnX, spawnY, 0)
        .setLinearDamping(0.1)
        .setAngularDamping(0.3)
        .setCcdEnabled(true)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setRestitution(0.45)
        .setFriction(0.1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ballBody
    );
    ballBody.setLinvel({ x: 0, y: this.config.launchSpeed, z: 0 }, true);

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.55,
        metalness: 0.15,
        roughness: 0.25,
      })
    );
    this.scene.add(ballMesh);

    this.activeBalls.push({
      body: ballBody,
      mesh: ballMesh,
      spawnTime: performance.now(),
    });
  }

  private tick(): void {
    const now = performance.now();
    const delta = Math.min((now - this.lastTickTime) / 1000, 0.05);
    const limitedDelta = Math.min(delta, this.config.maxFrameDelta);
    this.lastTickTime = now;
    this.accumulator += limitedDelta;

    this.updateLight(now);
    while (this.accumulator >= this.config.fixedStep) {
      this.stepPhysics();
      this.accumulator -= this.config.fixedStep;
    }
    this.syncMeshesToPhysics();
    this.updateGateVisuals();
    this.cleanupBalls();
    this.handleGameOver();
    this.renderBackgroundHex();
    this.renderer.render(this.scene, this.camera);

    this.rafId = requestAnimationFrame(this.tick);
  }

  private updateLight(now: number): void {
    if (!this.isLightStopped && now - this.lastLightUpdate > this.config.lightSweepIntervalMs) {
      this.lightIndex += this.lightDirection;
      if (this.lightIndex >= this.config.numGates - 1 || this.lightIndex <= 0) this.lightDirection *= -1;
      this.lastLightUpdate = now;
    }
  }

  private stepPhysics(): void {
    if (!this.world || !this.eventQueue) return;
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const gate = this.findGateByHandle(h1) ?? this.findGateByHandle(h2);
      if (!gate) return;
      const ball = this.findBallByColliderHandle(h1) ?? this.findBallByColliderHandle(h2);
      if (!ball || ball.remove) return;
      if (gate.index === this.activeGateIndex) {
        this.ballCount += this.config.winReward;
        this.ui.updateLives(this.ballCount);
      }
      ball.remove = true;
    });
  }

  private syncMeshesToPhysics(): void {
    for (const ball of this.activeBalls) {
      const p = ball.body.translation();
      ball.mesh.position.set(p.x, p.y, p.z);
      const r = ball.body.rotation();
      ball.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  private cleanupBalls(): void {
    for (let i = this.activeBalls.length - 1; i >= 0; i -= 1) {
      const ball = this.activeBalls[i];
      const pos = ball.body.translation();
      const age = performance.now() - ball.spawnTime;
      const outOfBounds =
        pos.y < -this.config.ballOutBottomOffset ||
        pos.y > this.config.logicalHeight / this.config.scale + this.config.ballOutTopOffset;
      const inLaunchLane =
        pos.x > toWorldX(this.config, this.config.logicalWidth - this.config.tunnelWidth - 4);
      const stalled = Math.abs(ball.body.linvel().y) < 0.6;
      if (age > 1200 && inLaunchLane && stalled) {
        ball.remove = true;
      }

      if (age > this.config.ballCleanupDelayMs && (Boolean(ball.remove) || outOfBounds)) {
        this.world?.removeRigidBody(ball.body);
        this.scene.remove(ball.mesh);
        ball.mesh.geometry.dispose();
        (ball.mesh.material as THREE.Material).dispose();
        this.activeBalls.splice(i, 1);
        if (this.activeBalls.length === 0 && !this.isGameOver) {
          this.isLightStopped = false;
          this.ui.setIndicator("red");
          this.ui.setButtons(true, false);
        }
      }
    }
  }

  private handleGameOver(): void {
    if (this.ballCount === 0 && this.activeBalls.length === 0 && !this.isGameOver) {
      this.isGameOver = true;
      alert("SYSTEM HALT - REBOOTING");
      window.location.reload();
    }
  }

  private async initPhysics(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -this.config.gravity, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    const built = createBoard(this.scene, this.world, this.config, RAPIER);
    this.gateSensors = built.gateSensors;
  }

  private updateGateVisuals(): void {
    const highlighted = this.isLightStopped ? this.activeGateIndex : this.lightIndex;
    for (const gate of this.gateSensors) {
      const material = gate.mesh.material;
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const isActive = gate.index === highlighted;
      material.emissive.setHex(isActive ? 0xccff00 : 0x00ffff);
      material.emissiveIntensity = isActive ? 0.95 : 0.18;
      material.opacity = isActive ? 0.95 : 0.25;
    }
  }

  private findGateByHandle(handle: number): GateSensor | undefined {
    return this.gateSensors.find((gate) => gate.collider.handle === handle);
  }

  private findBallByColliderHandle(handle: number): ActiveBall | undefined {
    for (const ball of this.activeBalls) {
      const collider = ball.body.collider(0);
      if (collider && collider.handle === handle) return ball;
    }
    return undefined;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.active = true;
  };

  private readonly handlePointerLeave = (): void => {
    this.pointer.active = false;
  };

  private resizeBackgroundCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    this.backgroundCanvas.width = Math.floor(width * dpr);
    this.backgroundCanvas.height = Math.floor(height * dpr);
    this.backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.backgroundCtx.scale(dpr, dpr);

    const hexSize = Math.max(20, Math.min(34, Math.floor(Math.min(width, height) / 24)));
    const hStep = Math.sqrt(3) * hexSize;
    const vStep = hexSize * 1.5;
    const cols = Math.ceil(width / hStep) + 2;
    const rows = Math.ceil(height / vStep) + 2;
    this.hexLayout = { cols, rows, size: hexSize, hStep, vStep };
    this.hexGlowLevels = new Float32Array(cols * rows);
  }

  private renderBackgroundHex(): void {
    const ctx = this.backgroundCtx;
    const width = this.backgroundCanvas.width / (Math.min(window.devicePixelRatio || 1, 2));
    const height = this.backgroundCanvas.height / (Math.min(window.devicePixelRatio || 1, 2));
    ctx.clearRect(0, 0, width, height);

    const { cols, rows, size, hStep, vStep } = this.hexLayout;
    if (cols === 0 || rows === 0) return;

    const ballPoints = this.collectBallScreenPoints();
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      const y = row * vStep;
      for (let col = 0; col < cols; col += 1) {
        const x = col * hStep + (row % 2 === 1 ? hStep * 0.5 : 0);
        let targetGlow = 0;

        if (this.pointer.active) {
          const dx = x - this.pointer.x;
          const dy = y - this.pointer.y;
          const dist = Math.hypot(dx, dy);
          targetGlow = Math.max(targetGlow, Math.max(0, 1 - dist / 56));
        }

        for (const p of ballPoints) {
          const dx = x - p.x;
          const dy = y - p.y;
          const dist = Math.hypot(dx, dy);
          targetGlow = Math.max(targetGlow, Math.max(0, 1 - dist / 62));
        }

        const current = this.hexGlowLevels[index];
        const next = targetGlow > current ? targetGlow : current * 0.9;
        this.hexGlowLevels[index] = next;
        this.drawHexCell(ctx, x, y, size, next);
        index += 1;
      }
    }
  }

  private drawHexCell(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    glow: number
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const alpha = 0.1 + glow * 0.72;
    ctx.strokeStyle = `rgba(22, 38, 56, ${alpha})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (glow > 0.15) {
      ctx.strokeStyle = `rgba(0, 220, 255, ${glow * 0.68})`;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = "rgba(0, 220, 255, 0.9)";
      ctx.shadowBlur = 8 * glow;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  private collectBallScreenPoints(): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const canvasRect = this.canvas.getBoundingClientRect();
    for (const ball of this.activeBalls) {
      const projected = ball.mesh.position.clone().project(this.camera);
      points.push({
        x: canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width,
        y: canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height,
      });
    }
    return points;
  }
}
