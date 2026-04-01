import type { GameConfig } from "./types";

export const CONFIG: GameConfig = {
  logicalWidth: 500,
  logicalHeight: 800,
  ballRadius: 15,
  pinRadius: 10,
  initialBalls: 9,
  winReward: 5,
  numGates: 6,
  gateWidth: 70,
  scale: 10,
  tunnelWidth: 45,
  boardDepth: 4,
  gravity: 40,
  launchSpeed: 86,
  fixedStep: 1 / 60,
  maxFrameDelta: 0.05,
  lightSweepIntervalMs: 100,
  ballCleanupDelayMs: 500,
  ballOutBottomOffset: 4,
  ballOutTopOffset: 10,
};
