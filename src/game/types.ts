import type * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

export type IndicatorState = "red" | "green";

export interface GameConfig {
  logicalWidth: number;
  logicalHeight: number;
  ballRadius: number;
  pinRadius: number;
  initialBalls: number;
  winReward: number;
  numGates: number;
  gateWidth: number;
  scale: number;
  tunnelWidth: number;
  boardDepth: number;
  gravity: number;
  launchSpeed: number;
  fixedStep: number;
  maxFrameDelta: number;
  lightSweepIntervalMs: number;
  ballCleanupDelayMs: number;
  ballOutBottomOffset: number;
  ballOutTopOffset: number;
}

export interface ActiveBall {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  spawnTime: number;
  remove?: true;
}

export interface GateSensor {
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  index: number;
}

export interface UIElements {
  lifeCount: HTMLElement;
  indicator: HTMLElement;
  stopButton: HTMLButtonElement;
  shootButton: HTMLButtonElement;
  gameBoard: HTMLElement;
  canvas: HTMLCanvasElement;
  backgroundCanvas: HTMLCanvasElement;
}

export interface GameUI {
  updateLives: (count: number) => void;
  setIndicator: (state: IndicatorState) => void;
  setButtons: (canStop: boolean, canShoot: boolean) => void;
}

export interface GameRefs {
  activeBalls: ActiveBall[];
}
