import type { Map as MapLibreMap } from "maplibre-gl";
import type { ParkFeatureRecord } from "@/types/vegetation";
import {
  extractParkFeatures,
  flattenParkPolygons,
  mergeParkRecords,
} from "./park-feature-extractor";
import { polygonAreaM2, ringCentroid, type LngLat } from "./polygon-sampling";
import { VEGETATION_FEATURE_TYPES } from "./vegetation-config";

const ACCEPT = new Set<string>(VEGETATION_FEATURE_TYPES);

export type ParkAnchor = {
  lng: number;
  lat: number;
  featureId: string | null;
  areaM2: number;
  method: string;
};

function buildSourceIndex(
  sourceParks: ParkFeatureRecord[],
): Map<string, ParkFeatureRecord> {
  const index = new Map<string, ParkFeatureRecord>();
  for (const record of sourceParks) {
    index.set(record.id, record);
    const parts = record.id.split(":");
    const tail = parts[parts.length - 1];
    if (tail) index.set(`${record.source}:${record.sourceLayer}:${tail}`, record);
  }
  return index;
}

export function findPrimaryParkAnchor(map: MapLibreMap): ParkAnchor {
  const parks = listViewportGreenParks(map);
  if (parks[0]) {
    return {
      lng: parks[0].centroid[0],
      lat: parks[0].centroid[1],
      featureId: parks[0].id,
      areaM2: parks[0].areaM2,
      method: "viewport-green",
    };
  }
  const c = map.getCenter();
  return {
    lng: c.lng,
    lat: c.lat,
    featureId: null,
    areaM2: 0,
    method: "map-center-fallback",
  };
}

export function findPrimaryParkPolygon(map: MapLibreMap): ParkFeatureRecord | null {
  return listViewportGreenParks(map)[0] ?? null;
}

/**
 * Every distinct green fill currently visible (park / grass / wood / garden…).
 * Same OSM id across tiles is merged so trees cover the full green footprint.
 */
export function listViewportGreenParks(map: MapLibreMap): ParkFeatureRecord[] {
  const layerIds = greenFillLayerIds(map);
  const rendered: ReturnType<MapLibreMap["queryRenderedFeatures"]> = [];
  if (layerIds.length > 0) {
    try {
      rendered.push(...map.queryRenderedFeatures(undefined, { layers: layerIds }));
    } catch {
      /* ignore */
    }
  }

  const byKey = new Map<string, ParkFeatureRecord>();
  const sourceParks = extractParkFeatures(map);
  const sourceIndex = buildSourceIndex(sourceParks);

  for (const feature of rendered) {
    const geom = feature.geometry;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;

    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const sourceLayer = feature.sourceLayer ?? "park";
    if (!isAcceptedGreen(sourceLayer, props)) continue;

    const rawId = feature.id ?? props.osm_id ?? props.id;
    const key = `${feature.source}:${sourceLayer}:${String(rawId ?? "")}`;

    const fromSource =
      rawId !== undefined && rawId !== null
        ? sourceIndex.get(`${feature.source}:${sourceLayer}:${String(rawId)}`)
        : undefined;

    if (fromSource) {
      byKey.set(fromSource.id, fromSource);
      continue;
    }

    const record = recordFromGeometry(feature, key, sourceLayer, geom, props);
    if (!record || record.areaM2 < 40) continue;

    const existing = byKey.get(record.id);
    byKey.set(record.id, existing ? mergeParkRecords(existing, record) : record);
  }

  const bounds = map.getBounds();
  for (const record of sourceParks) {
    const existing = byKey.get(record.id);
    if (existing) {
      if (record.areaM2 > existing.areaM2 * 1.02) {
        byKey.set(record.id, record);
      }
      continue;
    }
    const [lng, lat] = record.centroid;
    if (
      lng >= bounds.getWest() &&
      lng <= bounds.getEast() &&
      lat >= bounds.getSouth() &&
      lat <= bounds.getNorth()
    ) {
      byKey.set(record.id, record);
    }
  }

  const list = [...byKey.values()];
  if (list.length === 0) return extractParkFeatures(map).slice(0, 12);

  const c = map.getCenter();
  return list.sort((a, b) => {
    const da = (a.centroid[0] - c.lng) ** 2 + (a.centroid[1] - c.lat) ** 2;
    const db = (b.centroid[0] - c.lng) ** 2 + (b.centroid[1] - c.lat) ** 2;
    return da - db || b.areaM2 - a.areaM2;
  });
}

function isAcceptedGreen(
  sourceLayer: string,
  props: Record<string, unknown>,
): boolean {
  if (sourceLayer === "park") return true;
  const klass = String(props.class ?? "").toLowerCase();
  const subclass = String(props.subclass ?? props.leisure ?? "").toLowerCase();
  if (ACCEPT.has(klass) || ACCEPT.has(subclass)) return true;
  // OMT parks/gardens are often class=grass + subclass=park|garden.
  if (klass === "grass" || klass === "wood") return true;
  return false;
}

function greenFillLayerIds(map: MapLibreMap): string[] {
  return (map.getStyle()?.layers ?? [])
    .filter((l) => {
      if (l.type !== "fill") return false;
      const id = l.id.toLowerCase();
      if (id === "park" || id.includes("park") || id.includes("garden")) return true;
      if (id.includes("landcover")) return true;
      if (id.includes("pitch") || id.includes("cemetery")) return true;
      if (
        id.includes("grass") ||
        id.includes("wood") ||
        id.includes("forest") ||
        id.includes("recreation")
      ) {
        return true;
      }
      return false;
    })
    .map((l) => l.id);
}

function recordFromGeometry(
  feature: { source: string; id?: string | number },
  key: string,
  sourceLayer: string,
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  props: Record<string, unknown>,
): ParkFeatureRecord | null {
  const record: ParkFeatureRecord = {
    id: key,
    source: feature.source,
    sourceLayer,
    geometry: geom,
    properties: props,
    areaM2: 0,
    centroid: [0, 0],
  };
  let area = 0;
  let bestArea = 0;
  let centroid: LngLat = [0, 0];
  for (const poly of flattenParkPolygons(record)) {
    const a = polygonAreaM2(poly.ring);
    area += a;
    if (a > bestArea) {
      bestArea = a;
      centroid = ringCentroid(poly.ring);
    }
  }
  if (area < 40) return null;
  record.areaM2 = area;
  record.centroid = centroid;
  return record;
}
