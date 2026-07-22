import type { FilterSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/**
 * Runtime evidence (Yerevan park centroid pixel):
 * layer=poi_r20 source=openmaptiles source-layer=poi
 * class=playground subclass=playground
 * (park class was already filtered; the visible circular icon is playground)
 */
const HIDE_CLASSES = ["park", "garden", "cemetery", "playground", "pitch"] as const;
const HIDE_SUBCLASSES = ["park", "garden", "tree", "playground", "pitch"] as const;

const POI_LAYER_IDS = ["poi_r1", "poi_r7", "poi_r20"] as const;

const originalFilters = new Map<string, FilterSpecification | null>();

/**
 * Hide only park/garden/playground/tree POI icons — not all POIs.
 */
export function hideParkTreeSymbols(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return;

  const exclusion: FilterSpecification = [
    "!",
    [
      "any",
      ["in", ["get", "class"], ["literal", [...HIDE_CLASSES]]],
      ["in", ["get", "subclass"], ["literal", [...HIDE_SUBCLASSES]]],
    ],
  ];

  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const id = layer.id;
    const isKnownPoi = (POI_LAYER_IDS as readonly string[]).includes(id);
    const looksLikePoi = id.toLowerCase().includes("poi");
    if (!isKnownPoi && !looksLikePoi) continue;

    try {
      if (!originalFilters.has(id)) {
        originalFilters.set(id, (map.getFilter(id) as FilterSpecification | null) ?? null);
      }
      const existing = originalFilters.get(id) ?? null;
      const next = existing
        ? (["all", existing, exclusion] as FilterSpecification)
        : exclusion;
      map.setFilter(id, next);

      map.setPaintProperty(id, "icon-opacity", [
        "case",
        [
          "any",
          ["in", ["get", "class"], ["literal", [...HIDE_CLASSES]]],
          ["in", ["get", "subclass"], ["literal", [...HIDE_SUBCLASSES]]],
        ],
        0,
        1,
      ]);
      map.setPaintProperty(id, "text-opacity", [
        "case",
        [
          "any",
          ["in", ["get", "class"], ["literal", [...HIDE_CLASSES]]],
          ["in", ["get", "subclass"], ["literal", [...HIDE_SUBCLASSES]]],
        ],
        0,
        0.9,
      ]);
    } catch (error) {
      console.warn("[omt-glb-poc] park/tree POI filter failed", id, error);
    }
  }
}

export function describeParkTreeIconSource(): string {
  return [
    "Runtime: poi_r20 / openmaptiles / poi",
    'feature class=playground (circular icon at park centroid)',
    "also exclude park/garden/pitch",
  ].join("; ");
}
