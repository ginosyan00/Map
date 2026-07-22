import type { Map as MapLibreMap } from "maplibre-gl";
import {
  expandBBox,
  fetchRoadsInBBox,
  type RoadLine,
} from "@/lib/map/overpass-roads";
import { extractRoadsFromVectorTiles } from "@/lib/map/vector-roads";
import {
  createVehicles,
  tickVehiclesInPlace,
  type Vehicle,
} from "@/lib/map/vehicle-sim";
import {
  ensureVehicle3DLayer,
  removeVehicle3DLayer,
  type Vehicle3DLayer,
} from "./Vehicle3DLayer";
import { VEHICLE_LAYER_ID, VEHICLE_SOURCE_ID } from "@/lib/map/constants";

export type VehicleTrafficHandle = {
  setEnabled: (enabled: boolean) => void;
  destroy: () => void;
};

const NETWORK_SYNC_MS = 1600;
const BBOX_RADIUS_DEG = 0.04;

/**
 * Fleet spawns once; every car keeps a permanent mesh and never despawns.
 */
export function attachVehicleTraffic(map: MapLibreMap): VehicleTrafficHandle {
  let enabled = false;
  const roadsById = new Map<string, RoadLine>();
  let roadList: RoadLine[] = [];
  let vehicles: Vehicle[] = [];
  let raf = 0;
  let lastTs = 0;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let abort: AbortController | null = null;
  let destroyed = false;
  let layer: Vehicle3DLayer | null = null;
  let bootstrapped = false;

  cleanupLegacy2D(map);
  layer = ensureVehicle3DLayer(map);

  const onMove = (): void => {
    if (!enabled) return;
    map.triggerRepaint();
    scheduleNetworkSync();
  };

  map.on("move", onMove);
  map.on("zoom", onMove);
  map.on("moveend", onMove);
  map.on("zoomend", onMove);

  const setEnabled = (next: boolean): void => {
    if (destroyed) return;
    enabled = next;
    if (!enabled) {
      stopLoop();
      abort?.abort();
      abort = null;
      roadsById.clear();
      roadList = [];
      vehicles = [];
      bootstrapped = false;
      layer?.setVehicles([]);
      layer?.setEnabled(false);
      return;
    }
    if (!layer) layer = ensureVehicle3DLayer(map);
    layer.setEnabled(true);
    void syncNetwork();
    startLoop();
  };

  const scheduleNetworkSync = (): void => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void syncNetwork();
    }, NETWORK_SYNC_MS);
  };

  const mergeRoads = (incoming: RoadLine[]): void => {
    for (const road of incoming) {
      roadsById.set(road.id, road);
    }
    if (roadsById.size > 2_000) {
      const center = map.getCenter();
      const ranked = [...roadsById.values()].sort((a, b) => {
        const ac = a.coords[Math.floor(a.coords.length / 2)] ?? a.coords[0]!;
        const bc = b.coords[Math.floor(b.coords.length / 2)] ?? b.coords[0]!;
        const da = (ac[0] - center.lng) ** 2 + (ac[1] - center.lat) ** 2;
        const db = (bc[0] - center.lng) ** 2 + (bc[1] - center.lat) ** 2;
        return da - db;
      });
      roadsById.clear();
      for (const road of ranked.slice(0, 1_600)) {
        roadsById.set(road.id, road);
      }
    }
    roadList = [...roadsById.values()];
  };

  const syncNetwork = async (): Promise<void> => {
    if (!enabled || destroyed) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const radius =
      zoom < 14 ? BBOX_RADIUS_DEG * 2.5 : zoom < 16 ? BBOX_RADIUS_DEG * 1.6 : BBOX_RADIUS_DEG;
    const bbox = expandBBox(center.lng, center.lat, radius);

    const tileRoads = extractRoadsFromVectorTiles(map);
    if (tileRoads.length >= 4) {
      mergeRoads(tileRoads);
      spawnOnceIfNeeded();
      return;
    }

    abort?.abort();
    abort = new AbortController();
    try {
      const nextRoads = await fetchRoadsInBBox(bbox, abort.signal);
      if (!enabled || destroyed) return;
      mergeRoads(nextRoads.length > 0 ? nextRoads : tileRoads);
      spawnOnceIfNeeded();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("[omt-glb-poc] vehicle roads fetch failed", error);
      if (tileRoads.length > 0) {
        mergeRoads(tileRoads);
        spawnOnceIfNeeded();
      }
    }
  };

  /** Spawn the entire spaced fleet once — never drip-feed new cars on pan. */
  const spawnOnceIfNeeded = (): void => {
    if (bootstrapped || roadList.length < 8) return;
    vehicles = createVehicles(roadList);
    bootstrapped = true;
    layer?.setVehicles(vehicles);
  };

  const startLoop = (): void => {
    if (raf) return;
    lastTs = performance.now();
    const frame = (ts: number): void => {
      raf = requestAnimationFrame(frame);
      if (!enabled || destroyed) return;

      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;

      if (vehicles.length > 0 && roadList.length > 0) {
        tickVehiclesInPlace(vehicles, roadsById, roadList, dt);
        // Pose only — never rebind/destroy meshes.
        layer?.syncVisiblePoses();
      }

      map.triggerRepaint();
    };
    raf = requestAnimationFrame(frame);
  };

  const stopLoop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const destroy = (): void => {
    destroyed = true;
    enabled = false;
    stopLoop();
    abort?.abort();
    if (syncTimer) clearTimeout(syncTimer);
    map.off("move", onMove);
    map.off("zoom", onMove);
    map.off("moveend", onMove);
    map.off("zoomend", onMove);
    removeVehicle3DLayer(map);
    cleanupLegacy2D(map);
    layer = null;
  };

  return { setEnabled, destroy };
}

function cleanupLegacy2D(map: MapLibreMap): void {
  if (map.getLayer(VEHICLE_LAYER_ID)) map.removeLayer(VEHICLE_LAYER_ID);
  if (map.getLayer("traffic-vehicles-shadow")) map.removeLayer("traffic-vehicles-shadow");
  if (map.getSource(VEHICLE_SOURCE_ID)) map.removeSource(VEHICLE_SOURCE_ID);
}
