import type { Body } from "planck-js";

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
}

export interface BallBodyData {
  type: "ball";
  spawnTime: number;
  remove?: true;
}

export interface WallFixtureData {
  type: "wall" | "rail";
}

export interface GateFixtureData {
  type: "gate";
  index: number;
}

export interface UIElements {
  lifeCount: HTMLElement;
  indicator: HTMLElement;
  stopButton: HTMLButtonElement;
  shootButton: HTMLButtonElement;
  canvas: HTMLCanvasElement;
}

export interface GameUI {
  updateLives: (count: number) => void;
  setIndicator: (state: IndicatorState) => void;
  setButtons: (canStop: boolean, canShoot: boolean) => void;
}

export interface GameRefs {
  activeBalls: Body[];
}
