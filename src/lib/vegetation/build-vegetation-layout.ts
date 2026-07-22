import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  ParkFeatureRecord,
  TreeInstanceSpec,
  TreeSpeciesId,
  VegetationConfig,
  VegetationQualityPreset,
} from "@/types/vegetation";
import {
  createSeededRandom,
  pickWeightedSpecies,
  seededRange,
} from "./deterministic-random";
import { flattenParkPolygons } from "./park-feature-extractor";
import { listViewportGreenParks } from "./find-park-anchor";
import { samplePolygonGrid, type LngLat } from "./polygon-sampling";
import { collectExclusions, isPointExcluded, type ExclusionSet } from "./tree-collision-filter";

export type VegetationBuildResult = {
  instances: TreeInstanceSpec[];
  parkCount: number;
  primaryParkId: string | null;
  primaryAreaM2: number;
  rejected: number;
  speciesCounts: Record<TreeSpeciesId, number>;
  lodLabel: string;
  exclusionVersion: string;
};

const emptyCounts = (): Record<TreeSpeciesId, number> => ({
  deciduous: 0,
  compact: 0,
  conifer: 0,
});

/**
 * Stable per-park tree generation. Same park id + config → same trees forever.
 * Density does NOT depend on zoom.
 */
export function generateTreesForPark(
  park: ParkFeatureRecord,
  config: VegetationConfig,
  quality: VegetationQualityPreset,
  exclusions: ExclusionSet,
  origin: LngLat,
  remainingCap: number,
): { instances: TreeInstanceSpec[]; rejected: number } {
  if (remainingCap <= 0) return { instances: [], rejected: 0 };

  const densityScale = quality.densityMultiplier;
  const spacing = Math.max(1.8, config.minSpacingMeters / Math.max(0.5, densityScale));
  const coverCount = Math.ceil(park.areaM2 / (spacing * spacing));
  const budget = Math.min(
    config.maxTreesPerFeature,
    Math.max(config.minTreesPerFeature, coverCount),
    remainingCap,
  );

  const instances: TreeInstanceSpec[] = [];
  let rejected = 0;
  const randBase = `${config.seed}:${config.configVersion}:${park.id}`;

  for (const poly of flattenParkPolygons(park)) {
    if (instances.length >= budget) break;
    const seed = `${randBase}:${poly.ring[0]?.[0]}`;
    const sampled = samplePolygonGrid({
      ring: poly.ring,
      holes: poly.holes,
      spacingM: spacing,
      edgePaddingM: config.edgePaddingMeters,
      maxPoints: budget - instances.length,
      seed,
    });
    rejected += sampled.rejected;

    const rand = createSeededRandom(`${seed}:var`);
    for (const [lng, lat] of sampled.points) {
      if (instances.length >= budget) break;
      if (
        isPointExcluded(
          lng,
          lat,
          origin,
          exclusions,
          config.buildingBufferMeters,
          config.roadBufferMeters,
        )
      ) {
        rejected++;
        continue;
      }

      const species = pickWeightedSpecies(rand, config.speciesWeights) as TreeSpeciesId;
      instances.push({
        id: `${park.id}:${instances.length}`,
        lng,
        lat,
        species,
        rotationY: seededRange(rand, 0, Math.PI * 2),
        scale: seededRange(rand, 0.75, 1.2),
        tint: seededRange(rand, 0.94, 1.06),
      });
    }
  }

  return { instances, rejected };
}

export function summarizeInstances(instances: TreeInstanceSpec[]): {
  speciesCounts: Record<TreeSpeciesId, number>;
} {
  const speciesCounts = emptyCounts();
  for (const inst of instances) speciesCounts[inst.species]++;
  return { speciesCounts };
}

/**
 * One-shot build for initial viewport (used when cache is empty).
 */
export function buildVegetationLayout(
  map: MapLibreMap,
  config: VegetationConfig,
  quality: VegetationQualityPreset,
): VegetationBuildResult {
  if (!config.enabled) {
    return emptyResult("off");
  }

  const parks = listViewportGreenParks(map).slice(0, 24);
  if (parks.length === 0) {
    return emptyResult("empty");
  }

  const origin = parks[0]!.centroid;
  const exclusions = collectExclusions(map, origin);
  const globalCap = Math.max(quality.maxInstances, 200);
  const instances: TreeInstanceSpec[] = [];
  let rejected = 0;

  for (const park of parks) {
    if (instances.length >= globalCap) break;
    const part = generateTreesForPark(
      park,
      config,
      quality,
      exclusions,
      origin,
      globalCap - instances.length,
    );
    instances.push(...part.instances);
    rejected += part.rejected;
  }

  const { speciesCounts } = summarizeInstances(instances);
  return {
    instances,
    parkCount: parks.length,
    primaryParkId: parks[0]?.id ?? null,
    primaryAreaM2: parks[0]?.areaM2 ?? 0,
    rejected,
    speciesCounts,
    lodLabel: quality.lod,
    exclusionVersion: exclusions.version,
  };
}

function emptyResult(lodLabel: string): VegetationBuildResult {
  return {
    instances: [],
    parkCount: 0,
    primaryParkId: null,
    primaryAreaM2: 0,
    rejected: 0,
    speciesCounts: emptyCounts(),
    lodLabel,
    exclusionVersion: "0",
  };
}
