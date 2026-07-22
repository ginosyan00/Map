import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  TreeInstanceSpec,
  VegetationConfig,
  VegetationDebugSnapshot,
  VegetationQualityId,
} from "@/types/vegetation";
import {
  generateTreesForPark,
  summarizeInstances,
} from "@/lib/vegetation/build-vegetation-layout";
import {
  describeParkTreeIconSource,
  hideParkTreeSymbols,
} from "@/lib/vegetation/hide-park-tree-symbols";
import { listViewportGreenParks } from "@/lib/vegetation/find-park-anchor";
import {
  DEFAULT_VEGETATION_CONFIG,
  VEGETATION_QUALITY,
  pickVegetationQuality,
} from "@/lib/vegetation/vegetation-config";
import { removeVegetationLayerSafe } from "@/lib/vegetation/vegetation-cleanup";
import { collectExclusions } from "@/lib/vegetation/tree-collision-filter";
import { isDev } from "@/lib/map/constants";
import { ensureVegetationLayer, type VegetationLayer } from "./VegetationLayer";

export type VegetationHandle = {
  setEnabled: (enabled: boolean) => void;
  regenerate: () => void;
  getDebug: () => VegetationDebugSnapshot;
  setConfigPatch: (patch: Partial<VegetationConfig>) => void;
  destroy: () => void;
};

const DISCOVER_MS = 350;

/**
 * Trees are generated once per park id (stable under zoom/pan).
 * Publish always prefers currently visible greens so the viewport is fully filled.
 */
export function attachVegetation(map: MapLibreMap): VegetationHandle {
  let enabled = true;
  let destroyed = false;
  let layer: VegetationLayer | null = ensureVegetationLayer(map);
  let discoverTimer: ReturnType<typeof setTimeout> | null = null;
  let quality: VegetationQualityId = pickVegetationQuality();
  let config: VegetationConfig = { ...DEFAULT_VEGETATION_CONFIG };
  let lastDebug: VegetationDebugSnapshot | null = null;

  const parkCache = new Map<string, TreeInstanceSpec[]>();
  const parkAreaCache = new Map<string, number>();
  let flatInstances: TreeInstanceSpec[] = [];
  let bootstrapped = false;

  hideParkTreeSymbols(map);
  if (isDev()) {
    console.info("[vegetation] 2D icon source:", describeParkTreeIconSource());
  }

  const globalCap = (): number =>
    Math.max(VEGETATION_QUALITY[quality].maxInstances, 400);

  const perParkCap = (): number =>
    Math.max(config.maxTreesPerFeature, VEGETATION_QUALITY[quality].maxInstances);

  /**
   * Draw viewport parks first so the green currently on screen is fully covered.
   */
  const publishInstances = (viewportIds: string[]): void => {
    if (!layer) return;
    const cap = globalCap();
    const selected: TreeInstanceSpec[] = [];
    const seen = new Set<string>();

    const pushPark = (id: string): void => {
      if (seen.has(id) || selected.length >= cap) return;
      const trees = parkCache.get(id);
      if (!trees || trees.length === 0) return;
      seen.add(id);
      for (const t of trees) {
        if (selected.length >= cap) break;
        selected.push(t);
      }
    };

    for (const id of viewportIds) pushPark(id);
    for (const id of parkCache.keys()) pushPark(id);

    flatInstances = selected;
    const { speciesCounts } = summarizeInstances(flatInstances);
    layer.setGroundOffset(config.groundOffsetMeters);
    layer.setQualityMeta(quality, VEGETATION_QUALITY[quality].lod);
    layer.setBuildMeta({
      parkLayer: "park/landcover/landuse",
      parkFeatureId: viewportIds[0] ?? [...parkCache.keys()][0] ?? null,
      parkCount: parkCache.size,
      polygonAreaM2: viewportIds.reduce(
        (sum, id) => sum + (parkAreaCache.get(id) ?? 0),
        0,
      ),
      requestedDensity: config.densityPerHectare,
      generatedTreeCount: flatInstances.length,
      rejectedPointCount: 0,
      speciesCounts,
    });
    layer.setInstances(flatInstances);
    lastDebug = layer.getDebugSnapshot(map.getZoom());

    if (isDev()) {
      console.info("[vegetation] stable grove", {
        trees: flatInstances.length,
        parks: parkCache.size,
        viewportParks: viewportIds.length,
      });
    }
    map.triggerRepaint();
  };

  const discoverNewParks = (): void => {
    if (destroyed || !layer || !enabled || !config.enabled) return;

    const parks = listViewportGreenParks(map);
    const viewportIds = parks.map((p) => p.id);
    if (parks.length === 0) {
      syncVisibility();
      return;
    }

    const preset = VEGETATION_QUALITY[quality];
    let changed = false;

    for (const park of parks) {
      const cachedArea = parkAreaCache.get(park.id);
      const needsUpgrade =
        cachedArea !== undefined &&
        park.areaM2 > cachedArea * 1.2 &&
        park.areaM2 - cachedArea > 300;

      if (parkCache.has(park.id) && !needsUpgrade) continue;

      if (needsUpgrade) {
        parkCache.delete(park.id);
        parkAreaCache.delete(park.id);
      }

      // Generate full coverage for this park (not starved by distant parks).
      const exclusions = collectExclusions(map, park.centroid);
      const { instances } = generateTreesForPark(
        park,
        config,
        preset,
        exclusions,
        park.centroid,
        perParkCap(),
      );

      // Never lock an empty layout — retry next discover when tiles/cap improve.
      if (instances.length === 0) continue;

      parkCache.set(park.id, instances);
      parkAreaCache.set(park.id, park.areaM2);
      changed = true;
    }

    if (changed || !bootstrapped || viewportIds.length > 0) {
      bootstrapped = true;
      publishInstances(viewportIds);
    }
    syncVisibility();
  };

  const scheduleDiscover = (): void => {
    if (discoverTimer) clearTimeout(discoverTimer);
    discoverTimer = setTimeout(() => {
      discoverTimer = null;
      discoverNewParks();
    }, DISCOVER_MS);
  };

  const syncVisibility = (): void => {
    if (!layer) return;
    const zoomOk = map.getZoom() >= config.minZoom;
    layer.setEnabled(enabled && config.enabled && zoomOk);
    map.triggerRepaint();
  };

  const clearAndRebuildAll = (): void => {
    parkCache.clear();
    parkAreaCache.clear();
    flatInstances = [];
    bootstrapped = false;
    discoverNewParks();
  };

  const onMoveEnd = (): void => {
    if (!enabled) return;
    scheduleDiscover();
  };

  const onZoomEnd = (): void => {
    if (!enabled) return;
    syncVisibility();
    scheduleDiscover();
  };

  const onSourceData = (event: { isSourceLoaded?: boolean }): void => {
    if (!event.isSourceLoaded || !enabled) return;
    hideParkTreeSymbols(map);
    scheduleDiscover();
  };

  map.on("moveend", onMoveEnd);
  map.on("zoomend", onZoomEnd);
  map.on("sourcedata", onSourceData);

  scheduleDiscover();

  return {
    setEnabled(next: boolean) {
      if (destroyed) return;
      enabled = next;
      config = { ...config, enabled: next };
      if (!layer) layer = ensureVegetationLayer(map);
      if (next) {
        syncVisibility();
        scheduleDiscover();
      } else {
        layer.setEnabled(false);
        map.triggerRepaint();
      }
    },
    regenerate() {
      quality = pickVegetationQuality();
      clearAndRebuildAll();
    },
    getDebug() {
      if (layer) lastDebug = layer.getDebugSnapshot(map.getZoom());
      return (
        lastDebug ?? {
          parkLayer: null,
          parkFeatureId: null,
          parkCount: parkCache.size,
          polygonAreaM2: 0,
          requestedDensity: config.densityPerHectare,
          generatedTreeCount: flatInstances.length,
          rejectedPointCount: 0,
          speciesCounts: { deciduous: 0, compact: 0, conifer: 0 },
          currentLod: "stable",
          currentZoom: map.getZoom(),
          drawCalls: 0,
          triangleEstimate: 0,
          modelLoading: "idle",
          windEnabled: false,
          shadowsEnabled: false,
          quality,
          enabled,
        }
      );
    },
    setConfigPatch(patch) {
      config = { ...config, ...patch };
      clearAndRebuildAll();
    },
    destroy() {
      destroyed = true;
      if (discoverTimer) clearTimeout(discoverTimer);
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onZoomEnd);
      map.off("sourcedata", onSourceData);
      parkCache.clear();
      parkAreaCache.clear();
      flatInstances = [];
      removeVegetationLayerSafe(map);
      layer = null;
    },
  };
}
