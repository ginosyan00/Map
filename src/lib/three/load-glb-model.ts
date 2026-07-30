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
  warning?: string;
};

const loader = new GLTFLoader();

function isSampleModelUrl(url: string): boolean {
  return (
    url === SAMPLE_MODEL_URL ||
    url === SAMPLE_MODEL_API_URL ||
    url.endsWith("/sample-building.glb") ||
    url === DEFAULT_APPLY_MODEL_URL
  );
}

function isExplicitProcedural(url: string): boolean {
  return url === PROCEDURAL_MODEL_URL || url.startsWith("procedural://");
}

/**
 * Keep live upload URLs (data: /api/models). Never rewrite user uploads to sample.
 * Reject empty; rewrite legacy procedural aliases for sample path.
 */
export function resolveDurableModelUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_APPLY_MODEL_URL;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/models/")) {
    return trimmed;
  }
  if (isExplicitProcedural(trimmed)) {
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

  if (isExplicitProcedural(url.trim())) {
    return { root: createProceduralBuilding(), fromProcedural: true };
  }

  const allowProceduralFallback = isSampleModelUrl(resolved);
  const candidates = allowProceduralFallback
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

  if (allowProceduralFallback) {
    console.warn(
      "[omt-glb-poc] Sample model URLs failed, using procedural building:",
      resolved,
      lastError,
    );
    return {
      root: createProceduralBuilding(),
      fromProcedural: true,
      warning: "Sample GLB failed to load; showing procedural placeholder.",
    };
  }

  const message =
    lastError instanceof Error ? lastError.message : "Failed to load GLB model.";
  throw new Error(message);
}

/**
 * Neutral procedural fallback (explicit procedural:// or sample last resort).
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
