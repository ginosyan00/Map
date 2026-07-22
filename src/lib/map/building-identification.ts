import type { BuildingGeometry, BuildingIdentity, SelectedBuilding } from "@/types/building";

const OSM_KEYS = ["osm_id", "osm_way_id", "OSM_ID", "@id", "id_osm"] as const;
const CUSTOM_KEYS = ["custom_model_id", "custom_building_id", "building_id"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(props: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = props[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text.length > 0) return text;
  }
  return null;
}

function readNumber(props: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

/**
 * Deterministic geometry fingerprint for fallback identity.
 * Not usable as a MapLibre style filter expression.
 */
export function geometryFingerprint(geometry: BuildingGeometry): string {
  const normalized = normalizeGeometry(geometry);
  return `ghash:${fnv1a(normalized)}`;
}

function normalizeGeometry(geometry: BuildingGeometry): string {
  if (geometry.type === "Polygon") {
    return `P:${normalizeRings(geometry.coordinates)}`;
  }
  const polys = geometry.coordinates
    .map((rings) => normalizeRings(rings))
    .sort();
  return `MP:${polys.join("|")}`;
}

function normalizeRings(rings: number[][][]): string {
  return rings
    .map((ring) =>
      ring
        .map(([lng, lat]) => `${roundCoord(lng)},${roundCoord(lat)}`)
        .join(";"),
    )
    .join("/");
}

function roundCoord(n: number): string {
  return n.toFixed(6);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function resolveBuildingIdentity(input: {
  featureId: string | number | undefined;
  source: string;
  sourceLayer: string | undefined;
  properties: Record<string, unknown>;
  geometry: BuildingGeometry;
}): BuildingIdentity {
  const osmId = readString(input.properties, OSM_KEYS);
  if (osmId) {
    return {
      type: "osm-id",
      value: osmId,
      source: input.source,
      sourceLayer: input.sourceLayer,
    };
  }

  const customId = readString(input.properties, CUSTOM_KEYS);
  if (customId) {
    return {
      type: "custom-id",
      value: customId,
      source: input.source,
      sourceLayer: input.sourceLayer,
    };
  }

  if (input.featureId !== undefined && input.featureId !== null) {
    return {
      type: "feature-id",
      value: String(input.featureId),
      source: input.source,
      sourceLayer: input.sourceLayer,
    };
  }

  // No stable property and no vector feature id — geometry fingerprint only.
  // Cannot be used in MapLibre style filters.
  return {
    type: "geometry-hash",
    value: geometryFingerprint(input.geometry),
    source: input.source,
    sourceLayer: input.sourceLayer,
  };
}

export function identityKey(identity: BuildingIdentity): string {
  return `${identity.type}:${identity.source}:${identity.sourceLayer ?? ""}:${identity.value}`;
}

export function identitiesEqual(a: BuildingIdentity, b: BuildingIdentity): boolean {
  return identityKey(a) === identityKey(b);
}

/**
 * Polygon / MultiPolygon centroid (largest polygon for MultiPolygon).
 */
export function computeFootprintCenter(geometry: BuildingGeometry): [number, number] {
  if (geometry.type === "Polygon") {
    return ringCentroid(geometry.coordinates[0] ?? []);
  }

  let bestArea = -1;
  let best: [number, number] = [0, 0];
  for (const polygon of geometry.coordinates) {
    const ring = polygon[0] ?? [];
    const area = Math.abs(ringArea(ring));
    if (area > bestArea) {
      bestArea = area;
      best = ringCentroid(ring);
    }
  }
  return best;
}

function ringCentroid(ring: number[][]): [number, number] {
  if (ring.length === 0) return [0, 0];
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as [number, number];
    const [x1, y1] = ring[i] as [number, number];
    const f = x0 * y1 - x1 * y0;
    twiceArea += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const avgLng = ring.reduce((s, p) => s + (p[0] ?? 0), 0) / ring.length;
    const avgLat = ring.reduce((s, p) => s + (p[1] ?? 0), 0) / ring.length;
    return [avgLng, avgLat];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as [number, number];
    const [x1, y1] = ring[i] as [number, number];
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}

/** Absolute footprint area in squared degrees (for comparing buildings only). */
export function footprintArea(geometry: BuildingGeometry): number {
  if (geometry.type === "Polygon") {
    return Math.abs(ringArea(geometry.coordinates[0] ?? []));
  }
  return geometry.coordinates.reduce(
    (sum, polygon) => sum + Math.abs(ringArea(polygon[0] ?? [])),
    0,
  );
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True if lng/lat lies inside the building footprint (outer rings only). */
export function pointInBuilding(
  lng: number,
  lat: number,
  geometry: BuildingGeometry,
): boolean {
  if (geometry.type === "Polygon") {
    const outer = geometry.coordinates[0] ?? [];
    if (!pointInRing(lng, lat, outer)) return false;
    // Holes
    for (let i = 1; i < geometry.coordinates.length; i += 1) {
      if (pointInRing(lng, lat, geometry.coordinates[i] ?? [])) return false;
    }
    return true;
  }

  for (const polygon of geometry.coordinates) {
    const outer = polygon[0] ?? [];
    if (!pointInRing(lng, lat, outer)) continue;
    let inHole = false;
    for (let i = 1; i < polygon.length; i += 1) {
      if (pointInRing(lng, lat, polygon[i] ?? [])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function pointToRingDistanceSq(lng: number, lat: number, ring: number[][]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const point of ring) {
    const dx = (point[0] ?? 0) - lng;
    const dy = (point[1] ?? 0) - lat;
    min = Math.min(min, dx * dx + dy * dy);
  }
  // Also compare to centroid for façade clicks near the footprint.
  const [cx, cy] = ringCentroid(ring);
  const cdx = cx - lng;
  const cdy = cy - lat;
  return Math.min(min, cdx * cdx + cdy * cdy);
}

/**
 * Reduce MultiPolygon / Polygon to exactly one Polygon — the part under the click.
 * This prevents highlighting dozens of building parts from one MultiPolygon feature.
 */
export function extractClickedPolygon(
  geometry: BuildingGeometry,
  clickLng: number,
  clickLat: number,
): GeoJSON.Polygon {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map((c) => [...c])),
    };
  }

  const parts = geometry.coordinates;
  if (parts.length === 0) {
    return { type: "Polygon", coordinates: [] };
  }

  // Prefer the part that contains the click.
  for (const polygon of parts) {
    const asPolygon: GeoJSON.Polygon = { type: "Polygon", coordinates: polygon };
    if (pointInBuilding(clickLng, clickLat, asPolygon)) {
      return {
        type: "Polygon",
        coordinates: polygon.map((ring) => ring.map((c) => [...c])),
      };
    }
  }

  // Façade click: pick the nearest part by centroid/vertex distance.
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  parts.forEach((polygon, index) => {
    const outer = polygon[0] ?? [];
    const dist = pointToRingDistanceSq(clickLng, clickLat, outer);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  });

  const chosen = parts[bestIndex] ?? parts[0] ?? [];
  return {
    type: "Polygon",
    coordinates: chosen.map((ring) => ring.map((c) => [...c])),
  };
}

/** Other outer rings of a MultiPolygon that were not selected. */
export function extractSiblingPolygons(
  geometry: BuildingGeometry,
  kept: GeoJSON.Polygon,
): GeoJSON.Polygon[] {
  if (geometry.type === "Polygon") return [];

  const keptArea = footprintArea(kept);
  const [keptLng, keptLat] = computeFootprintCenter(kept);
  const siblings: GeoJSON.Polygon[] = [];

  for (const rings of geometry.coordinates) {
    const candidate: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: rings.map((ring) => ring.map((c) => [...c])),
    };
    const area = footprintArea(candidate);
    const [lng, lat] = computeFootprintCenter(candidate);
    const same =
      Math.abs(area - keptArea) < 1e-14 &&
      Math.abs(lng - keptLng) < 1e-8 &&
      Math.abs(lat - keptLat) < 1e-8;
    if (!same) siblings.push(candidate);
  }
  return siblings;
}

/**
 * Anchor near the click so the GLB sits on the clicked house, not a courtyard centroid.
 */
export function anchorNearClick(
  geometry: BuildingGeometry,
  clickLng: number,
  clickLat: number,
): [number, number] {
  if (pointInBuilding(clickLng, clickLat, geometry)) {
    return [clickLng, clickLat];
  }
  // Nearest vertex on outer ring(s).
  let best: [number, number] = computeFootprintCenter(geometry);
  let bestDist = Number.POSITIVE_INFINITY;
  const rings =
    geometry.type === "Polygon"
      ? [geometry.coordinates[0] ?? []]
      : geometry.coordinates.map((p) => p[0] ?? []);
  for (const ring of rings) {
    for (const point of ring) {
      const lng = point[0] ?? 0;
      const lat = point[1] ?? 0;
      const d = (lng - clickLng) ** 2 + (lat - clickLat) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = [lng, lat];
      }
    }
  }
  return best;
}

export function extractHeightFields(properties: Record<string, unknown>): {
  height: number | null;
  minHeight: number | null;
} {
  const height = readNumber(properties, [
    "render_height",
    "height",
    "building:levels",
  ]);
  const levels = readNumber(properties, ["building:levels"]);
  const resolvedHeight =
    height ?? (levels !== null ? levels * 3 : null);
  const minHeight = readNumber(properties, ["render_min_height", "min_height"]);
  return { height: resolvedHeight, minHeight };
}

export function canReliablyFilterHide(identity: BuildingIdentity): {
  canFilterHide: boolean;
  filterStrategy: SelectedBuilding["filterStrategy"];
  filterPropertyKey?: string;
  filterPropertyValue?: string | number;
} {
  if (identity.type === "osm-id") {
    return {
      canFilterHide: true,
      filterStrategy: "property",
      filterPropertyKey: "osm_id",
      filterPropertyValue: coerceId(identity.value),
    };
  }
  if (identity.type === "custom-id") {
    return {
      canFilterHide: true,
      filterStrategy: "property",
      filterPropertyKey: "custom_model_id",
      filterPropertyValue: identity.value,
    };
  }
  if (identity.type === "feature-id") {
    return {
      canFilterHide: true,
      filterStrategy: "feature-id",
      filterPropertyValue: coerceId(identity.value),
    };
  }
  return { canFilterHide: false, filterStrategy: "none" };
}

function coerceId(value: string): string | number {
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

/** ~250 m × 250 m in deg² — larger footprints are block/courtyard rings. */
const MAX_SAFE_HIDE_AREA = 0.00001;

export function buildSelectedBuilding(input: {
  featureId: string | number | undefined;
  source: string;
  sourceLayer: string | undefined;
  properties: unknown;
  geometry: BuildingGeometry;
  clickLng: number;
  clickLat: number;
}): SelectedBuilding {
  const properties = asRecord(input.properties);

  const sourceGeometry: BuildingGeometry =
    input.geometry.type === "Polygon"
      ? {
          type: "Polygon",
          coordinates: input.geometry.coordinates.map((ring) => ring.map((c) => [...c])),
        }
      : {
          type: "MultiPolygon",
          coordinates: input.geometry.coordinates.map((poly) =>
            poly.map((ring) => ring.map((c) => [...c])),
          ),
        };

  // Always keep a single Polygon under the click — never highlight a whole MultiPolygon cluster.
  const geometry = extractClickedPolygon(input.geometry, input.clickLng, input.clickLat);
  const preservedSiblings = extractSiblingPolygons(sourceGeometry, geometry);

  const identity = resolveBuildingIdentity({
    featureId: input.featureId,
    source: input.source,
    sourceLayer: input.sourceLayer,
    properties,
    geometry,
  });
  const [centerLng, centerLat] = computeFootprintCenter(geometry);
  const { height, minHeight } = extractHeightFields(properties);
  const filterMeta = canReliablyFilterHide(identity);

  let filterPropertyKey = filterMeta.filterPropertyKey;
  if (identity.type === "osm-id") {
    for (const key of OSM_KEYS) {
      if (properties[key] !== undefined && properties[key] !== null) {
        filterPropertyKey = key;
        break;
      }
    }
  }
  if (identity.type === "custom-id") {
    for (const key of CUSTOM_KEYS) {
      if (properties[key] !== undefined && properties[key] !== null) {
        filterPropertyKey = key;
        break;
      }
    }
  }

  // Prefer the real osm_id property key present on the feature.
  if (!filterPropertyKey) {
    for (const key of OSM_KEYS) {
      if (properties[key] !== undefined && properties[key] !== null) {
        filterPropertyKey = key;
        break;
      }
    }
  }
  let filterPropertyValue = filterMeta.filterPropertyValue;
  if (filterPropertyKey && properties[filterPropertyKey] != null) {
    const raw = properties[filterPropertyKey];
    if (typeof raw === "number" || typeof raw === "string") {
      filterPropertyValue = typeof raw === "string" && /^-?\d+$/.test(raw) ? Number(raw) : raw;
    }
  }

  const fullArea = footprintArea(sourceGeometry);
  const canHideBySize =
    fullArea <= MAX_SAFE_HIDE_AREA || preservedSiblings.length > 0;

  // Always allow hide when we have a stable vector id — exact match won't wipe neighbors.
  const hasStableId =
    input.featureId !== undefined &&
    input.featureId !== null &&
    String(input.featureId).length > 0;

  return {
    featureId: input.featureId,
    source: input.source,
    sourceLayer: input.sourceLayer,
    properties,
    geometry,
    sourceGeometry,
    preservedSiblings,
    clickLng: input.clickLng,
    clickLat: input.clickLat,
    centerLng,
    centerLat,
    identity,
    osmId: readString(properties, OSM_KEYS),
    customId: readString(properties, CUSTOM_KEYS),
    name: readString(properties, ["name", "name:en", "name:hy"]),
    buildingType: readString(properties, ["building", "type", "class"]),
    height,
    minHeight,
    canFilterHide: (filterMeta.canFilterHide && canHideBySize) || hasStableId,
    filterStrategy: filterMeta.filterStrategy,
    filterPropertyKey,
    filterPropertyValue,
  };
}

export function formatBuildingDebug(building: SelectedBuilding): string {
  return [
    "Selected building",
    `  identity: ${building.identity.type} = ${building.identity.value}`,
    `  featureId: ${String(building.featureId)}`,
    `  osmId: ${building.osmId ?? "—"}`,
    `  name: ${building.name ?? "—"}`,
    `  type: ${building.buildingType ?? "—"}`,
    `  height: ${building.height ?? "—"}`,
    `  minHeight: ${building.minHeight ?? "—"}`,
    `  source: ${building.source} / ${building.sourceLayer ?? "—"}`,
    `  center: ${building.centerLng.toFixed(6)}, ${building.centerLat.toFixed(6)}`,
    `  siblings: ${building.preservedSiblings.length}`,
    `  filter: ${building.filterStrategy} (canHide=${building.canFilterHide})`,
  ].join("\n");
}
