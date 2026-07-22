import type {
  TreeSpeciesId,
  VegetationConfig,
  VegetationQualityId,
  VegetationQualityPreset,
} from "@/types/vegetation";
import { VEGETATION_LAYER_ID as LAYER_ID } from "@/lib/map/constants";

export const VEGETATION_LAYER_ID = LAYER_ID;

export const VEGETATION_FEATURE_TYPES = [
  "park",
  "garden",
  "grass",
  "recreation_ground",
  "wood",
  "forest",
  "cemetery",
] as const;

/** Optional GLB URLs — loader falls back to procedural if missing. */
export const TREE_SPECIES_ASSETS: Record<
  TreeSpeciesId,
  { glbUrl: string; targetHeightM: number }
> = {
  deciduous: {
    glbUrl: "/models/trees/deciduous-tree-low.glb",
    targetHeightM: 9,
  },
  compact: {
    glbUrl: "/models/trees/compact-tree-low.glb",
    targetHeightM: 5.5,
  },
  conifer: {
    glbUrl: "/models/trees/conifer-tree-low.glb",
    targetHeightM: 11,
  },
};

export const DEFAULT_VEGETATION_CONFIG: VegetationConfig = {
  enabled: true,
  minZoom: 14.5,
  maxZoom: 22,
  densityPerHectare: 600,
  minSpacingMeters: 2.0,
  edgePaddingMeters: 0.35,
  maxTreesPerFeature: 1200,
  minTreesPerFeature: 36,
  seed: "omt-vegetation-v6",
  configVersion: "6",
  groundOffsetMeters: 0.05,
  roadBufferMeters: 0,
  buildingBufferMeters: 0.5,
  speciesWeights: {
    deciduous: 0.55,
    compact: 0.35,
    conifer: 0.1,
  },
};

export const VEGETATION_QUALITY: Record<VegetationQualityId, VegetationQualityPreset> = {
  low: {
    densityMultiplier: 0.85,
    shadows: false,
    wind: false,
    lod: "low",
    maxInstances: 900,
  },
  medium: {
    densityMultiplier: 1,
    shadows: false,
    wind: false,
    lod: "medium",
    maxInstances: 1800,
  },
  high: {
    densityMultiplier: 1.15,
    shadows: false,
    wind: false,
    lod: "high",
    maxInstances: 2800,
  },
};

export function pickVegetationQuality(): VegetationQualityId {
  if (typeof window === "undefined") return "medium";
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (w < 500 || dpr >= 3 || cores <= 4) return "low";
  if (w < 1100 || dpr >= 2) return "medium";
  return "high";
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
