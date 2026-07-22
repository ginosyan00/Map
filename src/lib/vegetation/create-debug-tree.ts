import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from "three";

/**
 * Single debug tree (~10 m): trunk + canopy primitives.
 * Origin at trunk base (y=0). No external GLB.
 */
export function createDebugTreeGroup(): Group {
  const tree = new Group();
  tree.name = "debug-park-tree";

  const trunk = new Mesh(
    new CylinderGeometry(0.35, 0.5, 4.5, 8),
    new MeshStandardMaterial({
      color: 0x6b4f35,
      roughness: 0.9,
      metalness: 0,
      depthTest: true,
      depthWrite: true,
    }),
  );
  trunk.position.y = 2.25;
  trunk.frustumCulled = false;
  trunk.castShadow = false;
  trunk.renderOrder = 10;

  const canopy = new Mesh(
    new IcosahedronGeometry(3.2, 1),
    new MeshStandardMaterial({
      color: 0x3d8f2a,
      roughness: 0.85,
      metalness: 0,
      side: DoubleSide,
      depthTest: true,
      depthWrite: true,
      emissive: 0x1a3d10,
      emissiveIntensity: 0.25,
    }),
  );
  canopy.position.y = 6.2;
  canopy.frustumCulled = false;
  canopy.castShadow = false;
  canopy.renderOrder = 10;

  tree.add(trunk, canopy);
  tree.frustumCulled = false;
  tree.renderOrder = 10;
  return tree;
}
