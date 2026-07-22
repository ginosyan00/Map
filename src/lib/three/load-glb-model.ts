import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Object3DEventMap,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DEFAULT_APPLY_MODEL_URL,
  PROCEDURAL_MODEL_URL,
  SAMPLE_MODEL_API_URL,
  SAMPLE_MODEL_URL,
} from "@/lib/map/constants";

export type LoadModelResult = {
  root: Object3D<Object3DEventMap>;
  fromProcedural: boolean;
};

const loader = new GLTFLoader();

/**
 * Keep live upload URLs (blob:/data:). Only rewrite empty / procedural / legacy paths.
 */
export function resolveDurableModelUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_APPLY_MODEL_URL;
  // User uploads must never be rewritten to the sample model.
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (trimmed.startsWith("procedural://") || trimmed === PROCEDURAL_MODEL_URL) {
    return DEFAULT_APPLY_MODEL_URL;
  }
  if (trimmed === "/api/sample-building") {
    return SAMPLE_MODEL_URL;
  }
  return trimmed;
}

async function loadFromUrl(url: string): Promise<Object3D<Object3DEventMap>> {
  const absolute =
    typeof window !== "undefined" && url.startsWith("/")
      ? `${window.location.origin}${url}`
      : url;
  const gltf = await loader.loadAsync(absolute);
  return gltf.scene;
}

export async function loadGlbModel(url: string): Promise<LoadModelResult> {
  const resolved = resolveDurableModelUrl(url);

  if (resolved === PROCEDURAL_MODEL_URL || resolved.startsWith("procedural://")) {
    return { root: createProceduralBuilding(), fromProcedural: true };
  }

  const candidates =
    resolved === SAMPLE_MODEL_URL || resolved.endsWith("/sample-building.glb")
      ? [SAMPLE_MODEL_URL, SAMPLE_MODEL_API_URL]
      : [resolved];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const root = await loadFromUrl(candidate);
      return { root, fromProcedural: false };
    } catch (error) {
      lastError = error;
      console.warn("[omt-glb-poc] Model fetch failed:", candidate, error);
    }
  }

  console.warn(
    "[omt-glb-poc] All model URLs failed, using procedural building:",
    resolved,
    lastError,
  );
  return { root: createProceduralBuilding(), fromProcedural: true };
}

/**
 * Neutral procedural fallback (only if every GLB URL fails).
 */
export function createProceduralBuilding(): Group {
  const group = new Group();
  group.name = "procedural-sample-building";

  const body = new Mesh(
    new BoxGeometry(14, 22, 12),
    new MeshStandardMaterial({
      color: 0xb8b0a4,
      metalness: 0.05,
      roughness: 0.55,
    }),
  );
  body.position.y = 11;
  group.add(body);

  const roof = new Mesh(
    new BoxGeometry(14.8, 0.8, 12.8),
    new MeshStandardMaterial({
      color: 0x8a8378,
      metalness: 0.05,
      roughness: 0.65,
    }),
  );
  roof.position.y = 22.4;
  group.add(roof);

  return group;
}
