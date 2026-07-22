import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TreeSpeciesId } from "@/types/vegetation";
import { TREE_SPECIES_ASSETS } from "./vegetation-config";

export type TreePartTemplate = {
  geometry: BufferGeometry;
  material: Material;
  localMatrix: Matrix4;
};

export type TreeSpeciesTemplate = {
  id: TreeSpeciesId;
  parts: TreePartTemplate[];
  triangleCount: number;
  source: "glb" | "procedural";
};

const gltfLoader = new GLTFLoader();
let templatesPromise: Promise<Map<TreeSpeciesId, TreeSpeciesTemplate>> | null = null;
let templates: Map<TreeSpeciesId, TreeSpeciesTemplate> | null = null;

export function preloadTreeTemplates(): Promise<Map<TreeSpeciesId, TreeSpeciesTemplate>> {
  if (templates) return Promise.resolve(templates);
  if (templatesPromise) return templatesPromise;

  templatesPromise = (async () => {
    const map = new Map<TreeSpeciesId, TreeSpeciesTemplate>();
    for (const id of Object.keys(TREE_SPECIES_ASSETS) as TreeSpeciesId[]) {
      const fromGlb = await tryLoadGlbSpecies(id);
      map.set(id, fromGlb ?? buildProceduralSpecies(id));
    }
    templates = map;
    return map;
  })().catch((error) => {
    templatesPromise = null;
    throw error;
  });

  return templatesPromise;
}

export function getTreeTemplates(): Map<TreeSpeciesId, TreeSpeciesTemplate> | null {
  return templates;
}

export function disposeTreeTemplates(): void {
  if (!templates) return;
  for (const species of templates.values()) {
    for (const part of species.parts) {
      part.geometry.dispose();
      part.material.dispose();
    }
  }
  templates = null;
  templatesPromise = null;
}

/** Set true when licensed/generated GLBs exist under public/models/trees/. */
const TRY_GLB_ASSETS = false;

async function tryLoadGlbSpecies(id: TreeSpeciesId): Promise<TreeSpeciesTemplate | null> {
  if (!TRY_GLB_ASSETS) return null;
  const meta = TREE_SPECIES_ASSETS[id];
  try {
    const gltf = await gltfLoader.loadAsync(meta.glbUrl);
    const parts: TreePartTemplate[] = [];
    let tris = 0;
    const root = new Group();
    root.add(gltf.scene);
    root.updateMatrixWorld(true);

    // Ground + center
    // (bbox normalize omitted if asset already authored correctly)
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.updateWorldMatrix(true, false);
      const local = mesh.matrixWorld.clone();
      const geometry = mesh.geometry.clone();
      const material = Array.isArray(mesh.material)
        ? mesh.material[0]!.clone()
        : mesh.material.clone();
      prepareLeafMaterial(material);
      parts.push({ geometry, material, localMatrix: local });
      const idx = geometry.index;
      tris += idx ? idx.count / 3 : geometry.attributes.position.count / 3;
    });

    if (parts.length === 0) return null;

    // Scale so approximate height matches target
    const scale = meta.targetHeightM / estimateHeight(parts);
    const scaleMat = new Matrix4().makeScale(scale, scale, scale);
    for (const part of parts) {
      part.localMatrix.premultiply(scaleMat);
    }

    return { id, parts, triangleCount: Math.round(tris), source: "glb" };
  } catch {
    return null;
  }
}

function estimateHeight(parts: TreePartTemplate[]): number {
  let maxY = 1;
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (!box) continue;
    maxY = Math.max(maxY, box.max.y * part.localMatrix.elements[5] + part.localMatrix.elements[13]);
  }
  return Math.max(1, maxY);
}

function prepareLeafMaterial(material: Material): void {
  const mat = material as MeshStandardMaterial;
  if (!("isMeshStandardMaterial" in mat) || !mat.isMeshStandardMaterial) return;
  mat.roughness = Math.max(mat.roughness ?? 0.7, 0.65);
  mat.metalness = Math.min(mat.metalness ?? 0.05, 0.1);
  if (mat.map && mat.transparent) {
    mat.transparent = false;
    mat.alphaTest = 0.45;
  }
  mat.needsUpdate = true;
}

function buildProceduralSpecies(id: TreeSpeciesId): TreeSpeciesTemplate {
  if (id === "conifer") return buildConifer();
  if (id === "compact") return buildCompact();
  return buildDeciduous();
}

function buildDeciduous(): TreeSpeciesTemplate {
  const trunkGeo = new CylinderGeometry(0.18, 0.28, 2.4, 8);
  trunkGeo.translate(0, 1.2, 0);
  const canopyGeo = new SphereGeometry(2.1, 10, 8);
  canopyGeo.translate(0, 4.2, 0);

  const trunkMat = new MeshStandardMaterial({
    color: 0x5c4636,
    roughness: 0.92,
    metalness: 0.02,
  });
  const leafMat = new MeshStandardMaterial({
    color: 0x5f7a4e,
    roughness: 0.88,
    metalness: 0.02,
    side: DoubleSide,
  });

  return {
    id: "deciduous",
    source: "procedural",
    triangleCount: estimateGeoTris(trunkGeo) + estimateGeoTris(canopyGeo),
    parts: [
      { geometry: trunkGeo, material: trunkMat, localMatrix: new Matrix4() },
      { geometry: canopyGeo, material: leafMat, localMatrix: new Matrix4() },
    ],
  };
}

function buildCompact(): TreeSpeciesTemplate {
  const trunkGeo = new CylinderGeometry(0.14, 0.22, 1.4, 7);
  trunkGeo.translate(0, 0.7, 0);
  const canopyGeo = new SphereGeometry(1.7, 9, 7);
  canopyGeo.scale(1.15, 0.85, 1.15);
  canopyGeo.translate(0, 2.5, 0);

  const trunkMat = new MeshStandardMaterial({
    color: 0x6a5240,
    roughness: 0.9,
    metalness: 0.02,
  });
  const leafMat = new MeshStandardMaterial({
    color: 0x6b8a58,
    roughness: 0.86,
    metalness: 0.02,
    side: DoubleSide,
  });

  return {
    id: "compact",
    source: "procedural",
    triangleCount: estimateGeoTris(trunkGeo) + estimateGeoTris(canopyGeo),
    parts: [
      { geometry: trunkGeo, material: trunkMat, localMatrix: new Matrix4() },
      { geometry: canopyGeo, material: leafMat, localMatrix: new Matrix4() },
    ],
  };
}

function buildConifer(): TreeSpeciesTemplate {
  const trunkGeo = new CylinderGeometry(0.16, 0.26, 2.8, 7);
  trunkGeo.translate(0, 1.4, 0);
  const canopyGeo = new ConeGeometry(1.8, 6.5, 9);
  canopyGeo.translate(0, 5.2, 0);

  const trunkMat = new MeshStandardMaterial({
    color: 0x4a3a2e,
    roughness: 0.93,
    metalness: 0.02,
  });
  const leafMat = new MeshStandardMaterial({
    color: 0x3f5c42,
    roughness: 0.9,
    metalness: 0.02,
    side: DoubleSide,
  });

  return {
    id: "conifer",
    source: "procedural",
    triangleCount: estimateGeoTris(trunkGeo) + estimateGeoTris(canopyGeo),
    parts: [
      { geometry: trunkGeo, material: trunkMat, localMatrix: new Matrix4() },
      { geometry: canopyGeo, material: leafMat, localMatrix: new Matrix4() },
    ],
  };
}

function estimateGeoTris(geometry: BufferGeometry): number {
  const idx = geometry.index;
  if (idx) return idx.count / 3;
  return (geometry.attributes.position?.count ?? 0) / 3;
}
