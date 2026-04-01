import * as planck from "planck-js";
import { CONFIG } from "./config";
import { createBoard } from "./board";
import type { BallBodyData, GameUI, GateFixtureData, GameConfig } from "./types";

const Vec2 = planck.Vec2;

interface EngineDeps {
  canvas: HTMLCanvasElement;
  ui: GameUI;
  config?: GameConfig;
}

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ui: GameUI;
  private readonly config: GameConfig;
  private readonly world: planck.World;
  private ballCount: number;
  private activeBalls: planck.Body[] = [];
  private isGameOver = false;
  private isLightStopped = false;
  private activeGateIndex = 0;
  private lightIndex = 0;
  private lightDirection = 1;
  private lastLightUpdate = 0;
  private renderScale = 1;
  private rafId = 0;

  constructor({ canvas, ui, config = CONFIG }: EngineDeps) {
    this.canvas = canvas;
    this.ui = ui;
    this.config = config;
    this.ballCount = config.initialBalls;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas rendering context.");
    this.ctx = ctx;

    const maybeSettings = (planck as unknown as { internal?: { Settings?: { maxTranslation: number } } }).internal
      ?.Settings;
    if (maybeSettings) maybeSettings.maxTranslation = 100.0;

    this.world = planck.World(Vec2(0, 80.0));
    createBoard(this.world, this.config);
    this.setupContacts();
  }

  public start(): void {
    this.resizeCanvas();
    this.ui.updateLives(this.ballCount);
    this.ui.setIndicator("red");
    this.ui.setButtons(true, false);
    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
  }

  public resizeCanvas(): void {
    const board = this.canvas.parentElement;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    const scaleX = rect.width / this.config.logicalWidth;
    const scaleY = rect.height / this.config.logicalHeight;
    this.renderScale = Math.min(scaleX, scaleY);
    const offsetX = (rect.width - this.config.logicalWidth * this.renderScale) / 2;
    const offsetY = (rect.height - this.config.logicalHeight * this.renderScale) / 2;
    this.ctx.translate(offsetX, offsetY);
  }

  public stopLight(): void {
    if (this.isLightStopped || this.isGameOver || this.activeBalls.length > 0) return;
    this.isLightStopped = true;
    this.activeGateIndex = this.lightIndex;
    this.ui.setIndicator("green");
    this.ui.setButtons(false, true);
  }

  public shootBall(): void {
    if (this.ballCount <= 0 || this.isGameOver || !this.isLightStopped || this.activeBalls.length > 0) return;
    this.ballCount -= 1;
    this.ui.updateLives(this.ballCount);
    this.ui.setButtons(false, false);

    const spawnX = (this.config.logicalWidth - this.config.tunnelWidth / 2) / this.config.scale;
    const spawnY = (this.config.logicalHeight - 40) / this.config.scale;
    const ball = this.world.createBody({
      type: "dynamic",
      position: Vec2(spawnX, spawnY),
      bullet: true,
    });

    ball.createFixture(planck.Circle(this.config.ballRadius / this.config.scale), {
      friction: 0.1,
      restitution: 0.4,
      density: 1.0,
    });
    ball.setUserData({ type: "ball", spawnTime: Date.now() } satisfies BallBodyData);
    ball.setLinearVelocity(Vec2(0, -100));
    this.activeBalls.push(ball);
  }

  private setupContacts(): void {
    this.world.on("begin-contact", (contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyAData = fixtureA.getBody().getUserData() as BallBodyData | undefined;
      const bodyBData = fixtureB.getBody().getUserData() as BallBodyData | undefined;
      const dataA = fixtureA.getUserData() as GateFixtureData | undefined;
      const dataB = fixtureB.getUserData() as GateFixtureData | undefined;

      const ballBody =
        bodyAData?.type === "ball"
          ? fixtureA.getBody()
          : bodyBData?.type === "ball"
            ? fixtureB.getBody()
            : null;
      const gateData = dataA?.type === "gate" ? dataA : dataB?.type === "gate" ? dataB : undefined;

      if (ballBody && gateData) {
        if (gateData.index === this.activeGateIndex) {
          this.ballCount += this.config.winReward;
          this.ui.updateLives(this.ballCount);
        }
        ballBody.setUserData({ type: "ball", spawnTime: Date.now(), remove: true } satisfies BallBodyData);
      }
    });
  }

  private tick(): void {
    this.world.step(1 / 60);
    this.ctx.clearRect(0, 0, this.config.logicalWidth, this.config.logicalHeight);

    this.updateLight();
    this.drawWorld();
    this.cleanupBalls();
    this.handleGameOver();

    this.rafId = requestAnimationFrame(this.tick);
  }

  private updateLight(): void {
    const now = Date.now();
    if (!this.isLightStopped && now - this.lastLightUpdate > 100) {
      this.lightIndex += this.lightDirection;
      if (this.lightIndex >= this.config.numGates - 1 || this.lightIndex <= 0) this.lightDirection *= -1;
      this.lastLightUpdate = now;
    }
  }

  private drawWorld(): void {
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const pos = body.getPosition();
      const angle = body.getAngle();
      for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
        const shape = fixture.getShape();
        const type = shape.getType();
        const fixtureData = fixture.getUserData() as GateFixtureData | { type?: string } | undefined;
        this.ctx.save();
        this.ctx.scale(this.renderScale, this.renderScale);
        this.ctx.translate(pos.x * this.config.scale, pos.y * this.config.scale);
        this.ctx.rotate(angle);

        if (type === "circle") {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, shape.m_radius * this.config.scale, 0, Math.PI * 2);
          const bodyData = body.getUserData() as BallBodyData | undefined;
          if (bodyData?.type === "ball") {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = "#ffffff";
          } else {
            this.ctx.fillStyle = "#ccff00";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "#ccff00";
          }
          this.ctx.fill();
        } else if (type === "edge" || type === "chain") {
          if (fixtureData?.type === "wall") {
            this.ctx.restore();
            continue;
          }
          this.ctx.beginPath();
          this.ctx.strokeStyle = "#00ffff";
          this.ctx.lineWidth = 3;
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = "#00ffff";
          const vertices =
            type === "edge"
              ? [(shape as planck.EdgeShape).m_vertex1, (shape as planck.EdgeShape).m_vertex2]
              : (shape as planck.ChainShape).m_vertices;
          this.ctx.moveTo(
            vertices[0].x * this.config.scale - pos.x * this.config.scale,
            vertices[0].y * this.config.scale - pos.y * this.config.scale
          );
          for (let i = 1; i < vertices.length; i += 1) {
            this.ctx.lineTo(
              vertices[i].x * this.config.scale - pos.x * this.config.scale,
              vertices[i].y * this.config.scale - pos.y * this.config.scale
            );
          }
          this.ctx.stroke();
        } else if (type === "polygon" && fixtureData?.type === "gate") {
          const gateData = fixtureData as GateFixtureData;
          const isActive = (this.isLightStopped ? this.activeGateIndex : this.lightIndex) === gateData.index;
          this.ctx.beginPath();
          this.ctx.fillStyle = isActive ? "#ccff00" : "rgba(0,255,255,0.06)";
          if (isActive) {
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = "#ccff00";
          }
          const vertices = (shape as planck.PolygonShape).m_vertices;
          this.ctx.moveTo(vertices[0].x * this.config.scale, vertices[0].y * this.config.scale);
          for (let i = 1; i < vertices.length; i += 1) {
            this.ctx.lineTo(vertices[i].x * this.config.scale, vertices[i].y * this.config.scale);
          }
          this.ctx.fill();
        }

        this.ctx.restore();
      }
    }
  }

  private cleanupBalls(): void {
    for (let i = this.activeBalls.length - 1; i >= 0; i -= 1) {
      const ball = this.activeBalls[i];
      const data = ball.getUserData() as BallBodyData;
      const pos = ball.getPosition();
      const age = Date.now() - data.spawnTime;
      const outOfBounds = pos.y * this.config.scale > this.config.logicalHeight + 50 || pos.y * this.config.scale < -2000;
      if (age > 500 && (Boolean(data.remove) || outOfBounds)) {
        this.world.destroyBody(ball);
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
}
