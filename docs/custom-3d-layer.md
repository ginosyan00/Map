# Custom 3D layer

## Interface

```ts
type: "custom"
renderingMode: "3d"
```

Implemented by `CustomBuildingLayer` (`src/components/map/CustomBuildingLayer.ts`).

## Mercator placement

```ts
const mercator = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
const meter = mercator.meterInMercatorCoordinateUnits();
```

Model matrix = translate(mercator) · scale(meter * uniformScale, with Y flip) · rotate(Euler XYZ from degrees).

Default rotation X = **90°** to reconcile Blender Z-up exports with the MapLibre/Three setup (`DEFAULT_MODEL_ROTATION_X`).

## Loading

- `GLTFLoader` for `.glb` / `.gltf`
- `procedural://` and missing sample → box placeholder
- Upload via `URL.createObjectURL` / `revokeObjectURL`

## Lifecycle

- `onAdd` / `onRemove` manage lights, renderer, listeners
- Removing a model disposes geometry, materials, textures
- One layer instance only (`CUSTOM_LAYER_ID`); duplicate add is guarded
- Models below `minZoom` are hidden (`object.visible = false`)

## Terrain (optional)

`queryTerrainAltitude` uses `map.queryTerrainElevation` when a terrain source exists; otherwise altitude `0`.
