import type { StyleSpecification, VectorSourceSpecification } from "maplibre-gl";
import { DEFAULT_VIEW } from "./camera-presets";

export type MapEnvConfig = {
  styleUrl: string | null;
  tilesUrl: string | null;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

export function getMapEnvConfig(): MapEnvConfig {
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || null;
  const tilesUrl = process.env.NEXT_PUBLIC_MAPTILES_URL?.trim() || null;
  const lng = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? DEFAULT_VIEW.center[0]);
  const lat = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? DEFAULT_VIEW.center[1]);
  const zoom = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_ZOOM ?? DEFAULT_VIEW.zoom);
  const pitch = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_PITCH ?? DEFAULT_VIEW.pitch);
  const bearing = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_BEARING ?? DEFAULT_VIEW.bearing);

  return {
    styleUrl,
    tilesUrl,
    center: [lng, lat],
    zoom: Number.isFinite(zoom) ? zoom : DEFAULT_VIEW.zoom,
    pitch: Number.isFinite(pitch) ? pitch : DEFAULT_VIEW.pitch,
    bearing: Number.isFinite(bearing) ? bearing : DEFAULT_VIEW.bearing,
  };
}

/**
 * Optionally rewrite OpenMapTiles vector source tiles to a self-hosted endpoint.
 */
export function applySelfHostedTiles(
  style: StyleSpecification,
  tilesUrl: string,
): StyleSpecification {
  const sources: StyleSpecification["sources"] = { ...style.sources };
  for (const [id, source] of Object.entries(sources)) {
    if (!source || typeof source !== "object") continue;
    if (!("type" in source) || source.type !== "vector") continue;
    const next: VectorSourceSpecification = {
      type: "vector",
      tiles: [tilesUrl],
      minzoom: "minzoom" in source && typeof source.minzoom === "number" ? source.minzoom : undefined,
      maxzoom: "maxzoom" in source && typeof source.maxzoom === "number" ? source.maxzoom : undefined,
      bounds: "bounds" in source ? (source.bounds as VectorSourceSpecification["bounds"]) : undefined,
      scheme: "scheme" in source ? (source.scheme as VectorSourceSpecification["scheme"]) : undefined,
      attribution:
        "attribution" in source && typeof source.attribution === "string"
          ? source.attribution
          : undefined,
    };
    sources[id] = next;
  }
  // Preserve native MVT feature ids (OpenFreeMap buildings have ids, but no osm_id property).
  return stripBrokenBuildingPromoteId({ ...style, sources });
}

function omitPromoteId(source: VectorSourceSpecification): VectorSourceSpecification {
  const next = { ...source } as VectorSourceSpecification & { promoteId?: unknown };
  delete next.promoteId;
  return next;
}

/**
 * OpenFreeMap building tiles expose native MVT feature ids, but NOT an `osm_id` property.
 * promoteId: "osm_id" clears those ids (property missing → feature has no id) and breaks hide.
 */
export function stripBrokenBuildingPromoteId(style: StyleSpecification): StyleSpecification {
  const sources: StyleSpecification["sources"] = { ...style.sources };
  for (const [id, source] of Object.entries(sources)) {
    if (!source || typeof source !== "object") continue;
    if (!("type" in source) || source.type !== "vector") continue;

    const vectorSource = source as VectorSourceSpecification;
    const current = "promoteId" in vectorSource ? vectorSource.promoteId : undefined;
    if (current === undefined || current === null) {
      sources[id] = { ...vectorSource };
      continue;
    }

    if (typeof current === "string") {
      // Do not promote a missing building property.
      sources[id] =
        current === "osm_id" ? omitPromoteId(vectorSource) : { ...vectorSource };
      continue;
    }

    if (typeof current === "object") {
      const next = { ...current } as Record<string, string>;
      if (next.building === "osm_id") delete next.building;
      const rest = omitPromoteId(vectorSource);
      sources[id] =
        Object.keys(next).length > 0
          ? ({ ...rest, promoteId: next } as VectorSourceSpecification)
          : rest;
      continue;
    }

    sources[id] = { ...vectorSource };
  }
  return { ...style, sources };
}

/** @deprecated Use stripBrokenBuildingPromoteId — osm_id promoteId breaks OpenFreeMap. */
export function applyBuildingPromoteId(style: StyleSpecification): StyleSpecification {
  return stripBrokenBuildingPromoteId(style);
}

export const FALLBACK_STYLE_HINT =
  "Set NEXT_PUBLIC_MAP_STYLE_URL in .env.local (e.g. https://tiles.openfreemap.org/styles/liberty).";
