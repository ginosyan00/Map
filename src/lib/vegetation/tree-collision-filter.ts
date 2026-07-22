import type { Map as MapLibreMap } from "maplibre-gl";
import { lngLatToLocalMeters, pointInRing, type LngLat, type MeterPoint } from "./polygon-sampling";

export type ExclusionSet = {
  buildingRings: MeterPoint[][];
  roadSegments: Array<{ a: MeterPoint; b: MeterPoint }>;
  waterRings: MeterPoint[][];
  version: string;
};

/**
 * Collect exclusion geometries once per vegetation rebuild (not per frame).
 * Coordinates are meters relative to `origin`.
 */
export function collectExclusions(
  map: MapLibreMap,
  origin: LngLat,
): ExclusionSet {
  const style = map.getStyle();
  const buildingRings: MeterPoint[][] = [];
  const waterRings: MeterPoint[][] = [];
  const roadSegments: Array<{ a: MeterPoint; b: MeterPoint }> = [];
  let versionBits = 0;

  if (!style?.sources) {
    return { buildingRings, roadSegments, waterRings, version: "0" };
  }

  for (const [sourceId, source] of Object.entries(style.sources)) {
    if (!source || typeof source !== "object" || source.type !== "vector") continue;

    versionBits += pullPolygons(map, sourceId, "building", origin, buildingRings, 400);
    versionBits += pullPolygons(map, sourceId, "water", origin, waterRings, 80);
    versionBits += pullRoads(map, sourceId, origin, roadSegments);
  }

  return {
    buildingRings,
    roadSegments,
    waterRings,
    version: String(versionBits),
  };
}

export function isPointExcluded(
  lng: number,
  lat: number,
  origin: LngLat,
  exclusions: ExclusionSet,
  _buildingBufferM: number,
  roadBufferM: number,
): boolean {
  const p = lngLatToLocalMeters(origin[0], origin[1], lng, lat);

  for (const ring of exclusions.waterRings) {
    if (pointInRing(p, ring)) return true;
  }

  for (const ring of exclusions.buildingRings) {
    // Only reject points that land inside a building footprint.
    if (pointInRing(p, ring)) return true;
  }

  const roadLimit = roadBufferM;
  for (const seg of exclusions.roadSegments) {
    if (distToSegment(p, seg.a, seg.b) < roadLimit) return true;
  }

  return false;
}

function pullPolygons(
  map: MapLibreMap,
  sourceId: string,
  sourceLayer: string,
  origin: LngLat,
  out: MeterPoint[][],
  limit: number,
): number {
  let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
  try {
    features = map.querySourceFeatures(sourceId, { sourceLayer });
  } catch {
    return 0;
  }
  let added = 0;
  for (const feature of features) {
    if (out.length >= limit) break;
    const geom = feature.geometry;
    if (!geom) continue;
    const rings = outerRings(geom);
    for (const ring of rings) {
      if (out.length >= limit) break;
      out.push(ring.map((c) => lngLatToLocalMeters(origin[0], origin[1], c[0], c[1])));
      added++;
    }
  }
  return added;
}

function pullRoads(
  map: MapLibreMap,
  sourceId: string,
  origin: LngLat,
  out: Array<{ a: MeterPoint; b: MeterPoint }>,
): number {
  let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
  try {
    features = map.querySourceFeatures(sourceId, { sourceLayer: "transportation" });
  } catch {
    return 0;
  }
  const drivables = new Set([
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "unclassified",
    "living_street",
    "service",
  ]);
  let added = 0;
  for (const feature of features) {
    if (out.length > 2500) break;
    const klass = String(feature.properties?.class ?? "");
    if (!drivables.has(klass)) continue;
    const geom = feature.geometry;
    if (!geom) continue;
    const lines: LngLat[][] = [];
    if (geom.type === "LineString") lines.push(geom.coordinates as LngLat[]);
    else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) lines.push(line as LngLat[]);
    }
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        out.push({
          a: lngLatToLocalMeters(origin[0], origin[1], a[0], a[1]),
          b: lngLatToLocalMeters(origin[0], origin[1], b[0], b[1]),
        });
        added++;
      }
    }
  }
  return added;
}

function outerRings(geom: GeoJSON.Geometry): LngLat[][] {
  if (geom.type === "Polygon") return [geom.coordinates[0] as LngLat[]];
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.map((p) => p[0] as LngLat[]);
  }
  return [];
}

function distToSegment(p: MeterPoint, a: MeterPoint, b: MeterPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}
