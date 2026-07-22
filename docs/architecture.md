# Architecture

## Goals

Standalone Next.js POC that demonstrates replacing a **single** OpenMapTiles extruded building with a custom GLB, without embedding into a larger product codebase.

## Layers of responsibility

| Area | Responsibility |
| --- | --- |
| `MapView` | Map lifecycle, Strict Mode–safe init, wiring selection / highlight / custom layer |
| `building-layer.ts` | Detect or create `fill-extrusion` buildings layer |
| `building-identification.ts` | Stable identity priority + centroid + debug formatting |
| `building-filter.ts` | Merge exclusion filters; never hide the whole layer |
| `CustomBuildingLayer` | One MapLibre `custom` 3D layer, one Three.js scene for all models |
| `useCustomBuildings` | Multi-replacement store + `localStorage` |
| `useModelLoader` | Sample / URL / upload + `revokeObjectURL` |
| Editor panel | Developer-tool UI for inspect / transform / import-export |

## Data flow

```text
click → queryRenderedFeatures → SelectedBuilding
      → highlight GeoJSON
      → Apply Replacement → CustomBuildingModel[]
      → CustomBuildingLayer.setModels / updateTransforms
      → building-filter exclusions
      → localStorage
```

## Rendering

- MapLibre owns the WebGL context.
- Three.js `WebGLRenderer` is constructed with `{ canvas, context }` from the map.
- Model transforms update matrices only — **no GLB reload** on rotation/scale/position.
- `render()` does **not** call `triggerRepaint()` (avoids infinite loops). Repaint is triggered on model/transform changes.

## Persistence

`CustomBuildingStore` version `1` in `localStorage` key `omt-glb-poc:custom-buildings:v1`.

## Extensibility for production

- Keep identity + transform config as data; swap tile style via env.
- For many models: batch into one scene (already) or move to 3D Tiles / instancing.
- Prefer ETL-time stable IDs over feature-id filters.
