# 3D Trees Audit

Date: 2026-07-22  
Project: `omt-glb-poc` (OpenMapTiles + MapLibre GL JS + Three.js)

## Verdict

No 3D vegetation existed. Parks are 2D fills. The circular tree icon in the reference screenshot matches Liberty POI symbols (`class=park` / tree-like Maki icons). App code already sets POI symbol visibility to `none` in `applyBasemapLook`; vegetation adds a targeted park/tree symbol guard. Vegetation is a separate custom layer following the vehicle Three.js pattern.

## Relevant files

| Path | Purpose |
| --- | --- |
| `src/components/map/MapView.tsx` | Map bootstrap, style load, orchestration |
| `src/lib/map/map-style.ts` | Env / style URL / tile rewrite |
| `src/lib/map/basemap-polish.ts` | Park greens + hide POI symbols |
| `src/lib/map/atmosphere.ts` | Sky/fog; keeps POIs hidden when labels on |
| `src/components/map/CustomBuildingLayer.ts` | Building GLB custom layer |
| `src/components/map/Vehicle3DLayer.ts` | Fleet GLB custom layer (reuse pattern) |
| `src/components/map/VehicleTrafficLayer.ts` | Lifecycle / RAF / cleanup pattern |
| `src/lib/three/load-glb-model.ts` | Building GLTFLoader |
| `src/lib/three/load-car-models.ts` | Preload + clone templates |
| `src/lib/three/dispose-three-object.ts` | Dispose helper |
| `src/lib/map/vector-roads.ts` | `querySourceFeatures` pattern |
| `src/lib/map/mercator-transform.ts` | Mercator helpers |
| `src/lib/map/constants.ts` | Layer IDs |
| `package.json` | maplibre-gl 5.24.0, three 0.185.1 |

## Current architecture

- One MapLibre map; style fetched once at boot (no `setStyle` reload path).
- Two independent Three.js custom layers (`custom-buildings-three`, `traffic-vehicles-three`), each with private Scene / Camera / WebGLRenderer wrapping MapLibre’s shared canvas context (`autoClear: false`, `resetState()`).
- Buildings: sparse unique GLBs, per-object mercator projection.
- Vehicles: dense clones, local meters around map center, continuous RAF.

## Detected park layers (OpenFreeMap Liberty / OpenMapTiles)

| Layer ID | Type | Source | source-layer |
| --- | --- | --- | --- |
| `park` | fill | `openmaptiles` | `park` |
| `park_outline` | line | `openmaptiles` | `park` |
| `landcover_grass` / `landcover_wood` | fill | `openmaptiles` | `landcover` |

Vector tiles: `https://tiles.openfreemap.org/planet`.

## Detected 2D tree icon

- Not an HTML Marker or React component.
- Liberty POI symbol layers (`poi_r*`) use `source-layer: poi` with `icon-image` from `class` / `subclass` (park/tree icons appear as circular sprites).
- App already forces POI / housenumber / shop symbol visibility to `none`.
- Vegetation module adds `hideParkTreeSymbols` as a non-invasive safety net for park/tree symbols only.

## Reusable Three.js resources

- CustomLayerInterface + shared WebGL context pattern (`Vehicle3DLayer`)
- `GLTFLoader` (no Draco / KTX2 / Meshopt yet)
- `disposeThreeObject`
- Local meters placement + `getMatrixForModel` / Mercator fallback
- `querySourceFeatures` for vector extraction

## Files safe to modify / add

- New `src/lib/vegetation/**`, `src/components/map/vegetation/**`, `src/types/vegetation.ts`
- Light touches: `MapView.tsx`, `constants.ts`, `useGraphicOptions.ts`, `GraphicOptionsPanel.tsx`, `HomeClient.tsx` (toggle + debug)
- Docs under `docs/`
- Optional `public/models/trees/` assets

## Must remain untouched (behavior)

- Building selection / hide / replacement / GLB building pipeline
- OpenMapTiles source contract, promoteId strip, storage schema
- Map init options, routes, persistence, camera presets core logic
- Vehicle simulation internals (copy pattern only)

## Proposed architecture

```
OMT park/landcover polygons
  → extract + identity
  → deterministic Poisson-disc sampling + exclusions
  → species templates (procedural or GLB)
  → InstancedMesh groups in one VegetationLayer
  → MapLibre CustomLayerInterface (shared WebGL context)
```

## Implementation risks

- Extra Three renderer thrashing GL state (already 2 layers).
- Building-style per-object projection will not scale — must instance.
- Terrain on: trees at altitude 0 may float/sink slightly.
- Layer order vs vehicles/buildings.
- No Turf — custom geometry helpers only.
- Compressed tree GLBs need Draco/KTX2 later if assets require them.
