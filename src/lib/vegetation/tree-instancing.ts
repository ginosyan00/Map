import {
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene,
} from "three";
import type { TreeInstanceSpec, TreeSpeciesId } from "@/types/vegetation";
import type { TreeSpeciesTemplate } from "./tree-model-loader";
import { lngLatToLocalMeters } from "./polygon-sampling";

export type VegetationInstancing = {
  meshes: InstancedMesh[];
  drawCalls: number;
  triangleEstimate: number;
  setOrigin: (lng: number, lat: number) => void;
  updatePoses: (
    originLng: number,
    originLat: number,
    groundOffset: number,
    altitudeY?: (lng: number, lat: number) => number,
  ) => void;
  dispose: () => void;
};

type PartBucket = {
  mesh: InstancedMesh;
  localMatrix: Matrix4;
  instances: TreeInstanceSpec[];
};

/**
 * Build InstancedMesh groups: one mesh per species part.
 */
export function createVegetationInstancing(
  scene: Scene,
  templates: Map<TreeSpeciesId, TreeSpeciesTemplate>,
  instances: TreeInstanceSpec[],
): VegetationInstancing {
  const bySpecies = new Map<TreeSpeciesId, TreeInstanceSpec[]>();
  for (const inst of instances) {
    const list = bySpecies.get(inst.species) ?? [];
    list.push(inst);
    bySpecies.set(inst.species, list);
  }

  const buckets: PartBucket[] = [];
  let triangleEstimate = 0;

  for (const [speciesId, list] of bySpecies) {
    const template = templates.get(speciesId);
    if (!template || list.length === 0) continue;

    for (const part of template.parts) {
      const mesh = new InstancedMesh(part.geometry, part.material, list.length);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // MapLibre custom-layer Camera has no normal Three frustum — must disable.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      buckets.push({
        mesh,
        localMatrix: part.localMatrix.clone(),
        instances: list,
      });
      triangleEstimate += template.triangleCount * list.length;
    }
  }

  const tmpPos = new Vector3();
  const tmpQuat = new Quaternion();
  const tmpScale = new Vector3();
  const tmpEuler = new Euler();
  const tmpMatrix = new Matrix4();
  const tmpWorld = new Matrix4();

  const updatePoses = (
    originLng: number,
    originLat: number,
    groundOffset: number,
    altitudeY?: (lng: number, lat: number) => number,
  ): void => {
    for (const bucket of buckets) {
      for (let i = 0; i < bucket.instances.length; i++) {
        const inst = bucket.instances[i]!;
        const { x: east, y: north } = lngLatToLocalMeters(
          originLng,
          originLat,
          inst.lng,
          inst.lat,
        );
        const y = altitudeY ? altitudeY(inst.lng, inst.lat) : groundOffset;
        tmpPos.set(east, y, -north);
        tmpEuler.set(0, -inst.rotationY, 0);
        tmpQuat.setFromEuler(tmpEuler);
        tmpScale.set(inst.scale, inst.scale, inst.scale);
        tmpWorld.compose(tmpPos, tmpQuat, tmpScale);
        tmpMatrix.copy(tmpWorld).multiply(bucket.localMatrix);
        bucket.mesh.setMatrixAt(i, tmpMatrix);
      }
      bucket.mesh.instanceMatrix.needsUpdate = true;
      bucket.mesh.computeBoundingSphere();
    }
  };

  return {
    meshes: buckets.map((b) => b.mesh),
    drawCalls: buckets.length,
    triangleEstimate: Math.round(triangleEstimate),
    setOrigin: () => {
      /* poses use origin each update */
    },
    updatePoses,
    dispose: () => {
      for (const bucket of buckets) {
        scene.remove(bucket.mesh);
        // geometries/materials owned by templates — do not dispose here
        bucket.mesh.dispose();
      }
      buckets.length = 0;
    },
  };
}
