import * as planck from "planck-js";
import type { GameConfig, GateFixtureData, WallFixtureData } from "./types";

const Vec2 = planck.Vec2;

export function createBoard(world: planck.World, config: GameConfig): void {
  const ground = world.createBody();

  const wallLeft: WallFixtureData = { type: "wall" };
  const wallRight: WallFixtureData = { type: "wall" };
  const wallTop: WallFixtureData = { type: "wall" };

  ground.createFixture(
    planck.Box(
      50 / config.scale,
      config.logicalHeight / (2 * config.scale),
      Vec2(-50 / config.scale, config.logicalHeight / (2 * config.scale))
    ),
    { friction: 0, userData: wallLeft }
  );
  ground.createFixture(
    planck.Box(
      50 / config.scale,
      config.logicalHeight / (2 * config.scale),
      Vec2(
        (config.logicalWidth + 50) / config.scale,
        config.logicalHeight / (2 * config.scale)
      )
    ),
    { friction: 0, userData: wallRight }
  );
  ground.createFixture(
    planck.Box(
      config.logicalWidth / (2 * config.scale),
      50 / config.scale,
      Vec2(config.logicalWidth / (2 * config.scale), -50 / config.scale)
    ),
    { friction: 0, userData: wallTop }
  );

  const archSegments = 100;
  const archRadiusX = config.logicalWidth / (2 * config.scale);
  const archRadiusY = 250 / config.scale;
  const centerX = config.logicalWidth / (2 * config.scale);
  const centerY = 320 / config.scale;
  const archVertices: planck.Vec2[] = [];

  for (let i = 0; i <= archSegments; i += 1) {
    const angle = Math.PI + (i / archSegments) * Math.PI;
    archVertices.push(
      Vec2(centerX + Math.cos(angle) * archRadiusX, centerY + Math.sin(angle) * archRadiusY)
    );
  }
  ground.createFixture(planck.Chain(archVertices), {
    friction: 0.2,
    restitution: 0.2,
    userData: { type: "wall" } satisfies WallFixtureData,
  });

  ground.createFixture(
    planck.Edge(
      Vec2(
        (config.logicalWidth - config.tunnelWidth) / config.scale,
        (config.logicalHeight - 100) / config.scale
      ),
      Vec2((config.logicalWidth - config.tunnelWidth) / config.scale, 320 / config.scale)
    ),
    { friction: 0, userData: { type: "rail" } satisfies WallFixtureData }
  );

  const pinRows = 5;
  const startY = 350;
  const spacingY = 85;
  const spacingX = 100;
  const startX = 100;
  for (let row = 0; row < pinRows; row += 1) {
    const cols = row % 2 === 0 ? 4 : 3;
    const rowOffsetX = row % 2 === 0 ? 0 : spacingX / 2;
    for (let col = 0; col < cols; col += 1) {
      const x = startX + rowOffsetX + col * spacingX;
      const y = startY + row * spacingY;
      if (x < config.logicalWidth - config.tunnelWidth - 20) {
        const pin = world.createBody(Vec2(x / config.scale, y / config.scale));
        pin.createFixture(planck.Circle(config.pinRadius / config.scale), {
          friction: 0.1,
          restitution: 0.5,
        });
      }
    }
  }

  const startXGate = 15;
  for (let i = 0; i < config.numGates; i += 1) {
    const x = startXGate + i * config.gateWidth + config.gateWidth / 2;
    if (x + config.gateWidth / 2 < config.logicalWidth - config.tunnelWidth) {
      ground.createFixture(
        planck.Edge(
          Vec2((x - config.gateWidth / 2) / config.scale, (config.logicalHeight - 80) / config.scale),
          Vec2((x - config.gateWidth / 2) / config.scale, config.logicalHeight / config.scale)
        ),
        { friction: 0, userData: { type: "rail" } satisfies WallFixtureData }
      );

      const gate = world.createBody(Vec2(x / config.scale, (config.logicalHeight - 40) / config.scale));
      gate.createFixture(
        planck.Box((config.gateWidth - 10) / (2 * config.scale), 10 / config.scale),
        { isSensor: true, userData: { type: "gate", index: i } satisfies GateFixtureData }
      );
    }
  }
}
