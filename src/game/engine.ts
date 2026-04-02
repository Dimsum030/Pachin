import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CONFIG } from "./config";
import { createBoard, toWorldX, toWorldY } from "./board";
import type { ActiveBall, GameUI, GateSensor, GameConfig } from "./types";

interface EngineDeps {
  canvas: HTMLCanvasElement;
  backgroundCanvas: HTMLCanvasElement;
  gameBoard: HTMLElement;
  ui: GameUI;
  config?: GameConfig;
}

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly backgroundCanvas: HTMLCanvasElement;
  private readonly backgroundCtx: CanvasRenderingContext2D;
  private readonly gameBoard: HTMLElement;
  private readonly ui: GameUI;
  private readonly config: GameConfig;
  private readonly boardWidth: number;
  private readonly boardHeight: number;
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
  private readonly raycaster = new THREE.Raycaster();
  private hexBoardTexture: THREE.CanvasTexture | null = null;
  private hexBoardBaseCanvas: HTMLCanvasElement | null = null;
  private hexBoardLayout = {
    cols: 0,
    rows: 0,
    size: 0.36,
    hStep: 0,
    vStep: 0,
    texW: 0,
    texH: 0,
    boardW: 0,
    boardH: 0,
  };
  private readonly hexPlaneZ = -0.38;
  private borderHotUntil = 0;
  private borderIsHot = false;

  constructor({ canvas, backgroundCanvas, gameBoard, ui, config = CONFIG }: EngineDeps) {
    this.canvas = canvas;
    this.backgroundCanvas = backgroundCanvas;
    this.gameBoard = gameBoard;
    this.ui = ui;
    this.config = config;
    this.ballCount = config.initialBalls;
    const bgCtx = backgroundCanvas.getContext("2d");
    if (!bgCtx) throw new Error("Unable to create background rendering context.");
    this.backgroundCtx = bgCtx;
    this.scene = new THREE.Scene();

    const boardWidth = this.config.logicalWidth / this.config.scale;
    const boardHeight = this.config.logicalHeight / this.config.scale;
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;
    // Wide FOV (>90°) + low oblique eye line = arcade cabinet in front of you, not a top-down map.
    this.camera = new THREE.PerspectiveCamera(102, 1, 0.1, 320);
    this.applyCabinetCamera(boardWidth, boardHeight);
    this.camera.updateProjectionMatrix();

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
    this.camera.aspect = rect.width / rect.height;
    const boardWidth = this.config.logicalWidth / this.config.scale;
    const boardHeight = this.config.logicalHeight / this.config.scale;
    this.applyCabinetCamera(boardWidth, boardHeight);
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
    this.updateBorderHeat(now);
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
    const boardWidth = this.config.logicalWidth / this.config.scale;
    const boardHeight = this.config.logicalHeight / this.config.scale;
    this.setupHexBoardPlane(boardWidth, boardHeight);
    const built = createBoard(this.scene, this.world, this.config, RAPIER);
    this.gateSensors = built.gateSensors;
  }

  private setupHexBoardPlane(boardWidth: number, boardHeight: number): void {
    const texW = 768;
    const texH = Math.max(256, Math.round((texW * boardHeight) / boardWidth));
    const canvas = document.createElement("canvas");
    canvas.width = texW;
    canvas.height = texH;
    this.hexBoardBaseCanvas = document.createElement("canvas");
    this.hexBoardBaseCanvas.width = texW;
    this.hexBoardBaseCanvas.height = texH;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.hexBoardTexture = texture;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      depthWrite: false,
    });
    const geom = new THREE.PlaneGeometry(boardWidth, boardHeight);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(boardWidth / 2, boardHeight / 2, this.hexPlaneZ);
    mesh.renderOrder = -10;
    this.scene.add(mesh);

    const hexR = 0.36;
    const hStep = Math.sqrt(3) * hexR;
    const vStep = hexR * 1.5;
    const cols = Math.ceil(boardWidth / hStep) + 6;
    const rows = Math.ceil(boardHeight / vStep) + 6;
    this.hexBoardLayout = {
      cols,
      rows,
      size: hexR,
      hStep,
      vStep,
      texW,
      texH,
      boardW: boardWidth,
      boardH: boardHeight,
    };

    this.buildHexBoardBaseTexture();
  }

  private buildHexBoardBaseTexture(): void {
    if (!this.hexBoardBaseCanvas) return;
    const ctx = this.hexBoardBaseCanvas.getContext("2d");
    if (!ctx) return;
    const { texW, texH } = this.hexBoardLayout;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, texW, texH);

    // Create a small repeating tile with a few hex outlines.
    const tileW = 160;
    const tileH = 140;
    const tile = document.createElement("canvas");
    tile.width = tileW;
    tile.height = tileH;
    const tctx = tile.getContext("2d");
    if (!tctx) return;

    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, tileW, tileH);
    tctx.lineWidth = 1.2;
    tctx.strokeStyle = "rgba(120, 165, 200, 0.14)";

    const r = 22;
    const hStep = Math.sqrt(3) * r;
    const vStep = r * 1.5;
    for (let row = -1; row <= 3; row += 1) {
      const y = row * vStep + r * 0.75;
      for (let col = -1; col <= 4; col += 1) {
        const x = col * hStep + (row % 2 === 1 ? hStep * 0.5 : 0) + r * 0.75;
        this.drawHexPath(tctx, x, y, r);
        tctx.stroke();
      }
    }

    // A few faint accent strokes for depth.
    tctx.strokeStyle = "rgba(0, 220, 255, 0.07)";
    tctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i += 1) {
      const x = (i + 1) * hStep * 0.9;
      const y = (i + 1) * vStep * 0.75;
      this.drawHexPath(tctx, x, y, r);
      tctx.stroke();
    }

    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    ctx.strokeStyle = "rgba(255,255,255,0)";
    ctx.fillStyle = pattern;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillRect(0, 0, texW, texH);
  }

  private drawHexPath(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
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

  /**
   * Centered perspective: camera on board centerline (X), no lateral offset (avoids crooked horizon).
   * Sits in front on +Z with a small downward Y offset so the playfield reads upright.
   */
  private applyCabinetCamera(boardWidth: number, boardHeight: number): void {
    const cx = boardWidth / 2;
    const cy = boardHeight / 2;
    const target = new THREE.Vector3(cx, cy, 0);
    this.camera.up.set(0, 1, 0);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const margin = 1.08;
    const halfH = (boardHeight * margin) / 2;
    const halfW = (boardWidth * margin) / 2;
    const distV = halfH / Math.tan(fovRad / 2);
    const distH = halfW / (Math.tan(fovRad / 2) * Math.max(this.camera.aspect, 0.01));
    const distZ = Math.max(distV, distH) * 1.04;
    const yBelowCenter = boardHeight * 0.055;
    this.camera.position.set(cx, cy - yBelowCenter, distZ);
    this.camera.lookAt(target);
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
  }

  private renderBackgroundHex(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.backgroundCanvas.width / dpr;
    const h = this.backgroundCanvas.height / dpr;
    this.backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.backgroundCtx.clearRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
    this.backgroundCtx.scale(dpr, dpr);
    this.backgroundCtx.fillStyle = "#111827";
    this.backgroundCtx.fillRect(0, 0, w, h);
    this.renderHexBoardPlane();
  }

  private getPointerOnBoardPlane(): { x: number; y: number } | null {
    if (!this.pointer.active) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((this.pointer.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((this.pointer.y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, this.hexPlaneZ)
    );
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    const pad = 2;
    const { boardW, boardH } = this.hexBoardLayout;
    if (
      hit.x < -pad ||
      hit.x > boardW + pad ||
      hit.y < -pad ||
      hit.y > boardH + pad
    ) {
      return null;
    }
    return { x: hit.x, y: hit.y };
  }

  private renderHexBoardPlane(): void {
    if (!this.hexBoardTexture) return;
    const canvas = this.hexBoardTexture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { texW, texH, boardW, boardH } = this.hexBoardLayout;
    if (texW === 0 || texH === 0) return;

    // Start from a clean repeating base every frame (no trails).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.hexBoardBaseCanvas) {
      ctx.drawImage(this.hexBoardBaseCanvas, 0, 0);
    } else {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, texW, texH);
    }

    // Draw fast glow blobs at ball & pointer locations.
    // (This replaces the expensive full-grid scan.)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const ptr = this.getPointerOnBoardPlane();
    if (ptr) {
      const tx = (ptr.x / boardW) * texW;
      const ty = texH - (ptr.y / boardH) * texH;
      this.drawGlowBlob(ctx, tx, ty, 46, "rgba(0, 220, 255, 0.55)");
    }

    for (const ball of this.activeBalls) {
      const p = ball.body.translation();
      const tx = (p.x / boardW) * texW;
      const ty = texH - (p.y / boardH) * texH;
      this.drawGlowBlob(ctx, tx, ty, 62, "rgba(0, 220, 255, 0.62)");
    }

    ctx.restore();

    this.hexBoardTexture.needsUpdate = true;
  }

  private drawGlowBlob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radiusPx: number,
    color: string
  ): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radiusPx);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  private updateBorderHeat(now: number): void {
    const r = this.config.ballRadius / this.config.scale;
    const pad = Math.max(0.8, r * 1.6);
    let touched = false;
    for (const ball of this.activeBalls) {
      const p = ball.body.translation();
      if (
        p.x < pad ||
        p.x > this.boardWidth - pad ||
        p.y < pad ||
        p.y > this.boardHeight - pad
      ) {
        touched = true;
        break;
      }
    }

    if (touched) this.borderHotUntil = Math.max(this.borderHotUntil, now + 180);
    const hot = now < this.borderHotUntil;
    if (hot !== this.borderIsHot) {
      this.borderIsHot = hot;
      this.gameBoard.classList.toggle("game-board-frame-hot", hot);
    }
  }

}
