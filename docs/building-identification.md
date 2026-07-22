# Building identification

## Priority

1. **`osm_id`** (and common aliases: `osm_way_id`, `@id`, …)
2. **Custom property** (`custom_model_id`, `custom_building_id`, `building_id`)
3. **Vector tile feature ID** (`feature.id`)
4. **Geometry fingerprint** (normalized ring coordinates → FNV-1a hash)

`BuildingIdentity` always carries `source` and optional `sourceLayer` so keys stay unique across sources.

## Feature ID instability

Vector tile feature IDs **can change** when:

- the user zooms across tile boundaries / overzooming strategies,
- the tileset is rebuilt with different tippecanoe / Planetiler settings,
- features are clipped differently per tile.

Do **not** treat feature IDs as permanent production keys unless you control ID generation (e.g. promote `osm_id` to feature id at build time and verify stability).

## Geometry hash

Used only as a last-resort local key for storage / matching in app state.

It is **not** expressible as a MapLibre style filter. The UI must warn when exclusion relies on geometry-hash alone.

## Centroid

Footprint center is computed from polygon rings (shoelace centroid). For `MultiPolygon`, the largest outer ring by absolute area is used. Click lng/lat is stored separately and is **not** used as the model anchor.
