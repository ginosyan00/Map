import type { Material, Object3D, Texture } from "three";

function disposeMaterial(material: Material): void {
  const withMaps = material as Material & Record<string, unknown>;
  for (const key of Object.keys(withMaps)) {
    const value = withMaps[key];
    if (value && typeof value === "object" && "isTexture" in (value as object)) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

/**
 * Recursively dispose geometries, materials, and textures.
 */
export function disposeThreeObject(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(mesh.material);
      }
    }
  });
}
