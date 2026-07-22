# 3D Tree Architecture

## Data flow

```
Map load
  → hideParkTreeSymbols (POI park/tree icons)
  → attachVegetation
      → query park / landcover polygons (viewport)
      → sample points (seeded Poisson-disc + edge pad)
      → exclude buildings / roads / water (staged)
      → pick species + variation (seeded)
      → build InstancedMesh groups
  → VegetationLayer.render each MapLibre frame
```

## Map layer flow

1. Basemap park fills (`park`, `landcover_*`) stay as ground color.
2. Building fill-extrusions write depth.
3. `threejs-vegetation-layer` draws opaque trees (shared depth).
4. Custom buildings / vehicles may sit above; trees do not intercept clicks.

## Polygon extraction

- `querySourceFeatures` on vector sources with source-layers `park`, `landcover`.
- Accept classes: park, garden, grass, recreation_ground, wood, forest, cemetery (configurable).
- MultiPolygon → per-ring polygons; compute area, centroid, stable identity.

## Sampling

- Project polygon to local meters around centroid.
- Inset by `edgePaddingMeters`.
- Bridson-style Poisson-disc with `minSpacingMeters`.
- Cap `maxTreesPerFeature` × quality density multiplier.
- Seed = `hash(featureId + configVersion + seed)`.

## Exclusions (generation-time, cached)

1. Outside inset polygon → reject  
2. Near building footprints (`querySourceFeatures` building) → reject  
3. Near transportation centerlines (buffer) → reject  
4. Water polygons → reject  
5. Too close to another accepted tree → reject  

## Instancing

- Template per species: list of `{ geometry, material, localMatrix }`.
- One `InstancedMesh` per part; instance matrix = translate × rotateY × scale × local.
- Geometries/materials shared; never clone per tree.
- Rebuild on moveend debounce when viewport parks change, not every frame.

## Coordinate conversion

- Scene origin = map center (same as vehicles).
- Tree lng/lat → east/north meters.
- Projection: `getMatrixForModel(origin)` × mainMatrix, with Mercator fallback.
- Ground offset `0.05` m to reduce z-fighting.

## LOD / quality

| Zoom | Behavior |
| --- | --- |
| < 15.5 | Hide 3D trees |
| 15.5–16.5 | Low density / low LOD |
| 16.5–18 | Medium |
| > 18 | Full configured density |

Presets: `low` / `medium` / `high` from DPR + viewport + optional frame budget.

## Wind / shadows

- Wind: optional shared uniform shader patch; **disabled by default** (static trees first).
- Shadows: off by default; high preset may enable later if FPS OK.

## Cleanup

- Remove listeners, cancel timers, remove custom layer.
- Dispose unique geometries/materials owned by vegetation.
- Do **not** dispose MapLibre canvas or other layers’ renderers’ shared context incorrectly — dispose vegetation renderer wrapper only.

## Future

- Drop-in GLB species under `public/models/trees/`.
- Draco/KTX2 when assets need them.
- Worker for huge multi-park sampling.
- 3d-tiles only if city-scale forest required.
