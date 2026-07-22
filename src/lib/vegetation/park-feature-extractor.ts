import type { Map as MapLibreMap } from "maplibre-gl";
import type { ParkFeatureRecord } from "@/types/vegetation";
import { VEGETATION_FEATURE_TYPES } from "./vegetation-config";
import { polygonAreaM2, ringCentroid, type LngLat } from "./polygon-sampling";

const ACCEPT = new Set<string>(VEGETATION_FEATURE_TYPES);

/**
 * Extract park / green polygons from loaded OpenMapTiles vector sources.
 * Same OSM id can appear as multiple tile-clipped fragments — merge them.
 */
export function extractParkFeatures(map: MapLibreMap): ParkFeatureRecord[] {
  const style = map.getStyle();
  if (!style?.sources) return [];

  const byId = new Map<string, ParkFeatureRecord>();

  for (const [sourceId, source] of Object.entries(style.sources)) {
    if (!source || typeof source !== "object" || source.type !== "vector") continue;

    for (const sourceLayer of ["park", "landcover", "landuse"]) {
      let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
      try {
        features = map.querySourceFeatures(sourceId, { sourceLayer });
      } catch {
        continue;
      }

      for (const feature of features) {
        const record = toParkRecord(feature, sourceId, sourceLayer);
        if (!record) continue;
        const existing = byId.get(record.id);
        byId.set(record.id, existing ? mergeParkRecords(existing, record) : record);
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.areaM2 - a.areaM2);
}

/**
 * Union tile fragments that share the same park id into one MultiPolygon.
 * Vector tiles clip large greens per tile; without this, trees fill one corner only.
 */
export function mergeParkRecords(
  a: ParkFeatureRecord,
  b: ParkFeatureRecord,
): ParkFeatureRecord {
  const coords = [
    ...geometryToPolygonCoords(a.geometry),
    ...geometryToPolygonCoords(b.geometry),
  ];
  const geometry: GeoJSON.MultiPolygon = {
    type: "MultiPolygon",
    coordinates: coords,
  };
  const { areaM2, centroid } = measureGeometry(geometry);
  return {
    id: a.id,
    source: a.source,
    sourceLayer: a.sourceLayer,
    geometry,
    properties: { ...a.properties, ...b.properties },
    areaM2,
    centroid,
  };
}

function toParkRecord(
  feature: {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry?: GeoJSON.Geometry | null;
  },
  source: string,
  sourceLayer: string,
): ParkFeatureRecord | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const klass = String(props.class ?? "").toLowerCase();
  const subclass = String(props.subclass ?? props.leisure ?? "").toLowerCase();

  if (sourceLayer === "park") {
    // OMT park layer is already park polygons
  } else if (
    !ACCEPT.has(klass) &&
    !ACCEPT.has(subclass) &&
    klass !== "grass" &&
    klass !== "wood"
  ) {
    return null;
  }

  const geometry = feature.geometry;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    return null;
  }

  const { areaM2, centroid } = measureGeometry(geometry);
  if (areaM2 < 80) return null;

  const rawId =
    feature.id ??
    props.osm_id ??
    props.id ??
    `${centroid[0].toFixed(5)},${centroid[1].toFixed(5)}`;
  const id = `${source}:${sourceLayer}:${String(rawId)}`;

  return {
    id,
    source,
    sourceLayer,
    geometry,
    properties: props,
    areaM2,
    centroid,
  };
}

export function flattenParkPolygons(
  feature: ParkFeatureRecord,
): Array<{ ring: LngLat[]; holes: LngLat[][] }> {
  const g = feature.geometry;
  if (g.type === "Polygon") {
    const coords = g.coordinates as LngLat[][];
    return [
      {
        ring: coords[0] ?? [],
        holes: coords.slice(1),
      },
    ];
  }
  return g.coordinates.map((poly) => ({
    ring: (poly[0] ?? []) as LngLat[],
    holes: poly.slice(1) as LngLat[][],
  }));
}

function geometryToPolygonCoords(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  return geometry.coordinates;
}

function measureGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): {
  areaM2: number;
  centroid: LngLat;
} {
  const rings = flattenRings(geometry);
  let areaM2 = 0;
  let best: LngLat = [0, 0];
  let bestArea = 0;
  for (const ring of rings) {
    const a = polygonAreaM2(ring);
    areaM2 += a;
    if (a > bestArea) {
      bestArea = a;
      best = ringCentroid(ring);
    }
  }
  return { areaM2, centroid: best };
}

function flattenRings(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): LngLat[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ? [geometry.coordinates[0] as LngLat[]] : [];
  }
  return geometry.coordinates
    .map((p) => p[0] as LngLat[] | undefined)
    .filter((r): r is LngLat[] => Boolean(r && r.length >= 3));
}
