import { Box3, type Object3D, Vector3 } from "three";

/**
 * Place model origin at ground center; keep units in meters.
 * Only auto-rescales when the asset is absurdly tiny/huge.
 */
export function prepareModelForMap(root: Object3D, buildingHeight?: number): void {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetHeight = Math.max(Number(buildingHeight ?? 0), 12);
  if (maxDim > 0 && (maxDim < 0.5 || maxDim > 250)) {
    const factor = targetHeight / Math.max(size.y, 0.001);
    root.scale.multiplyScalar(factor);
    root.updateMatrixWorld(true);
    const grounded = new Box3().setFromObject(root);
    root.position.y -= grounded.min.y;
  }
}
