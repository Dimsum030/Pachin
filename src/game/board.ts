import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { GameConfig, GateSensor } from "./types";

interface BuiltBoard {
  gateSensors: GateSensor[];
}

const CYAN = 0x00ffff;


export function toWorldX(config: GameConfig, pixelX: number): number {
  return pixelX / config.scale;
}

export function toWorldY(config: GameConfig, pixelY: number): number {
  return (config.logicalHeight - pixelY) / config.scale;
}

export function createBoard(
  scene: THREE.Scene,
  world: RAPIER.World,
  config: GameConfig,
  rapier: typeof RAPIER
): BuiltBoard {
  const boardWidth = config.logicalWidth / config.scale;
  const boardHeight = config.logicalHeight / config.scale;
  const halfDepth = config.boardDepth / 2;
  const wallThickness = 0.5;
  const railMaterial = new THREE.MeshStandardMaterial({
    color: CYAN,
    emissive: CYAN,
    emissiveIntensity: 0.35,
  });

  const staticBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const archStartY = boardHeight - (320 / config.scale);
  const wallShape = new THREE.BoxGeometry(wallThickness, archStartY, config.boardDepth);

  const leftWall = new THREE.Mesh(wallShape, railMaterial);
  leftWall.position.set(0, archStartY / 2, 0);
  scene.add(leftWall);
  world.createCollider(
    rapier.ColliderDesc.cuboid(wallThickness / 2, archStartY / 2, halfDepth).setTranslation(
      0,
      archStartY / 2,
      0
    ),
    staticBody
  );

  const rightWall = new THREE.Mesh(wallShape, railMaterial);
  rightWall.position.set(boardWidth, archStartY / 2, 0);
  scene.add(rightWall);
  world.createCollider(
    rapier.ColliderDesc.cuboid(wallThickness / 2, archStartY / 2, halfDepth).setTranslation(
      boardWidth,
      archStartY / 2,
      0
    ),
    staticBody
  );

  const baseCollider = rapier.ColliderDesc.cuboid(boardWidth / 2, wallThickness / 2, halfDepth)
    .setTranslation(boardWidth / 2, 0, 0)
    .setRestitution(0.15);
  world.createCollider(baseCollider, staticBody);

  const pinRows = 5;
  const startY = 350;
  const spacingY = 85;
  const spacingX = 100;
  const startX = 100;
  const pinRadius = config.pinRadius / config.scale;
  const pinGeometry = new THREE.CylinderGeometry(pinRadius, pinRadius, config.boardDepth, 16);
  const pinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0,
    emissive: 0x111111,
    roughness: 0.15,
    metalness: 0.85,
  });

  for (let row = 0; row < pinRows; row += 1) {
    const cols = row % 2 === 0 ? 4 : 3;
    const rowOffsetX = row % 2 === 0 ? 0 : spacingX / 2;
    for (let col = 0; col < cols; col += 1) {
      const pixelX = startX + rowOffsetX + col * spacingX;
      if (pixelX >= config.logicalWidth - config.tunnelWidth - 20) continue;
      const pixelY = startY + row * spacingY;
      const x = toWorldX(config, pixelX);
      const y = toWorldY(config, pixelY);

      const pin = new THREE.Mesh(pinGeometry, pinMaterial);
      pin.position.set(x, y, 0);
      pin.rotation.x = Math.PI / 2;
      scene.add(pin);

      world.createCollider(
        rapier.ColliderDesc.ball(pinRadius).setTranslation(x, y, 0).setRestitution(0.5),
        staticBody
      );
    }
  }

  const railStartX = config.logicalWidth - config.tunnelWidth;
  const railX = toWorldX(config, railStartX);
  const railTop = toWorldY(config, 320);
  const railBottom = toWorldY(config, config.logicalHeight - 100);
  const railHeight = railTop - railBottom;
  const railCenterY = railBottom + railHeight / 2;
  const launchRail = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, railHeight, config.boardDepth),
    railMaterial
  );
  launchRail.position.set(railX, railCenterY, 0);
  scene.add(launchRail);
  world.createCollider(
    rapier.ColliderDesc.cuboid(wallThickness / 2, railHeight / 2, halfDepth).setTranslation(
      railX,
      railCenterY,
      0
    ),
    staticBody
  );

  // Top arch: guides ball from launch rail into playfield
  const archSegments = 48;
  const archRadiusX = boardWidth / 2;
  const archRadiusY = 250 / config.scale;
  const centerXp = config.logicalWidth / 2 / config.scale;
  const centerYp = 320 / config.scale;
  const archPoints: THREE.Vector3[] = [];
  
  const archShape = new THREE.Shape();

  for (let i = 0; i <= archSegments; i += 1) {
    const t = i / archSegments;
    const angle = Math.PI + t * Math.PI;
    const x = centerXp + Math.cos(angle) * archRadiusX;
    const yp = centerYp + Math.sin(angle) * archRadiusY;
    const y = boardHeight - yp;
    archPoints.push(new THREE.Vector3(x, y, 0));

    const outerX = centerXp + Math.cos(angle) * (archRadiusX + wallThickness / 2);
    const outerYp = centerYp + Math.sin(angle) * (archRadiusY + wallThickness / 2);
    const outerY = boardHeight - outerYp;

    if (i === 0) archShape.moveTo(outerX, outerY);
    else archShape.lineTo(outerX, outerY);
  }

  for (let i = archSegments; i >= 0; i -= 1) {
    const t = i / archSegments;
    const angle = Math.PI + t * Math.PI;
    const innerX = centerXp + Math.cos(angle) * (archRadiusX - wallThickness / 2);
    const innerYp = centerYp + Math.sin(angle) * (archRadiusY - wallThickness / 2);
    const innerY = boardHeight - innerYp;
    archShape.lineTo(innerX, innerY);
  }
  archShape.closePath();

  const extrudeSettings = {
    depth: config.boardDepth,
    bevelEnabled: false,
    curveSegments: 24,
  };
  const archGeom = new THREE.ExtrudeGeometry(archShape, extrudeSettings);
  archGeom.translate(0, 0, -config.boardDepth / 2);

  const archMesh = new THREE.Mesh(archGeom, railMaterial);
  scene.add(archMesh);
  
  const archTubeRadius = wallThickness / 2;

  const archColliderR = archTubeRadius * 0.96;
  for (let i = 0; i < archPoints.length; i += 1) {
    const p = archPoints[i];
    world.createCollider(
      rapier.ColliderDesc.ball(archColliderR)
        .setTranslation(p.x, p.y, p.z)
        .setFriction(0.08)
        .setRestitution(0.22),
      staticBody
    );
  }

  const gateSensors: GateSensor[] = [];
  const gateY = toWorldY(config, config.logicalHeight - 40);
  const gateHeight = 1;
  const gateThickness = config.boardDepth - 0.8;
  const startXGate = 15;

  for (let i = 0; i < config.numGates; i += 1) {
    const pixelCenter = startXGate + i * config.gateWidth + config.gateWidth / 2;
    if (pixelCenter + config.gateWidth / 2 >= config.logicalWidth - config.tunnelWidth) continue;

    const gateWidth = (config.gateWidth - 10) / config.scale;
    const gateX = toWorldX(config, pixelCenter);

    const gateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(gateWidth, gateHeight, gateThickness),
      new THREE.MeshStandardMaterial({
        color: CYAN,
        emissive: CYAN,
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.25,
      })
    );
    gateMesh.position.set(gateX, gateY, 0);
    scene.add(gateMesh);

    const dividerX = toWorldX(config, pixelCenter - config.gateWidth / 2);
    world.createCollider(
      rapier.ColliderDesc.cuboid(wallThickness / 2, 4, halfDepth).setTranslation(dividerX, 4, 0),
      staticBody
    );

    const sensorCollider = world.createCollider(
      rapier.ColliderDesc.cuboid(gateWidth / 2, gateHeight / 2, gateThickness / 2)
        .setTranslation(gateX, gateY, 0)
        .setSensor(true)
        .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
      staticBody
    );

    gateSensors.push({
      collider: sensorCollider,
      mesh: gateMesh,
      index: i,
    });
  }

  return { gateSensors };
}
