# OpenMapTiles Custom GLB POC

Proof-of-concept: click an OpenMapTiles 3D extruded building on a MapLibre map, hide that footprint (when a stable ID exists), and place a custom `.glb` model at the same geographic location with live transform controls.

Stack: **Next.js · React · TypeScript · MapLibre GL JS · Three.js (GLTFLoader + CustomLayerInterface)**

---

## What it does

1. Loads an OpenMapTiles-compatible vector style (default: OpenFreeMap Liberty).
2. Ensures a `fill-extrusion` buildings layer (detects existing or creates one).
3. Lets you click a building → highlight + property panel.
4. Loads a sample / URL / uploaded GLB into a shared Three.js custom layer.
5. Best-effort hides only that building via style filter.
6. Persists replacements in `localStorage`, with JSON export/import.

---

## Quick start

```bash
cp .env.example .env.local
npm install
npm run generate:sample-model
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default center is Yerevan (`44.5152, 40.1872`) at zoom `16`, pitch `55`, bearing `-20`.

---

## Environment configuration

Copy `.env.example` → `.env.local`:

```env
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
NEXT_PUBLIC_MAPTILES_URL=
NEXT_PUBLIC_MAP_CENTER_LNG=44.5152
NEXT_PUBLIC_MAP_CENTER_LAT=40.1872
NEXT_PUBLIC_MAP_INITIAL_ZOOM=16
NEXT_PUBLIC_MAX_GLB_BYTES=26214400
```

### Option A — ready style URL

Set `NEXT_PUBLIC_MAP_STYLE_URL` to any OpenMapTiles-compatible MapLibre style JSON URL.

Examples (no paid Mapbox dependency):

- `https://tiles.openfreemap.org/styles/liberty`
- Self-hosted style: `https://your-server/styles/osm-bright/style.json`

### Option B — self-hosted vector tiles

1. Keep a style URL in `NEXT_PUBLIC_MAP_STYLE_URL`.
2. Set `NEXT_PUBLIC_MAPTILES_URL` to your PBF template, e.g.

```env
NEXT_PUBLIC_MAPTILES_URL=http://localhost:8080/data/v3/{z}/{x}/{y}.pbf
```

On load, the app rewrites vector source `tiles` to that endpoint.

**Never commit private tokens.** If a commercial tile host requires a key, put it only in `.env.local`.

---

## How to use

1. Orbit / pitch the map until 3D buildings are visible.
2. Click a building — it highlights; properties appear in the sidebar.
3. **Use Sample Model**, **Upload GLB**, or paste a model URL.
4. Click **Apply Replacement**.
5. Adjust longitude, latitude, altitude, rotations (degrees), scale, min zoom.
6. Refresh the page — replacements reload from `localStorage`.
7. **Restore Original Building** removes the custom model and restores the extrusion filter.

---

## Preparing a GLB in Blender

```text
Units: Metric
Unit Scale: 1
Apply Rotation
Apply Scale
Origin: building footprint center at ground level
Export: glTF Binary (.glb)
```

Coordinate note: Blender is typically Z-up; MapLibre/Three custom layers expect a model rotation. The POC defaults **Rotation X = 90°** (`DEFAULT_MODEL_ROTATION_X`). Prefer GLB origin at the **bottom center** of the building.

1 GLB unit ≈ 1 meter (scaled via `MercatorCoordinate.meterInMercatorCoordinateUnits()`).

---

## How original buildings are hidden

1. Prefer filter on stable properties: `osm_id`, `custom_model_id`, …
2. Else try `["!=", ["id"], featureId]`.
3. Original layer filter is **merged**, not blindly overwritten:

```json
["all", originalFilter, ["!=", ["get", "osm_id"], 123]]
```

If only a geometry hash is available, the UI shows a **warning**. The GLB can still be placed, but the extrusion may remain visible underneath. Geometry hashes **cannot** be used as MapLibre style filters.

Production-grade replacement needs a stable tileset property (`osm_id` or `custom_model_id`) or a custom tileset build.

---

## Why stable building IDs matter

| Identity | Stable? | Filterable? |
| --- | --- | --- |
| `osm_id` / custom property | Yes (if present in tiles) | Yes |
| Vector feature `id` | Often unstable across zoom / rebuilds | Sometimes via `["id"]` |
| Geometry hash | Deterministic locally | **No** (style filters can't match rings) |

---

## Adding `osm_id` / `custom_model_id` to a tileset

When generating OpenMapTiles / Planetiler / Tippecanoe extracts, keep OSM identifiers as feature properties, or inject `custom_model_id` during ETL. Then style filters can exclude individual buildings reliably.

---

## Architecture (short)

```text
MapLibre map
 ├─ vector fill-extrusion buildings
 ├─ GeoJSON highlight layers (selection only)
 └─ custom Three.js layer (all GLB replacements, one scene)
```

See `docs/` for details.

---

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run generate:sample-model
npm run format
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Blank map / style error | Missing `NEXT_PUBLIC_MAP_STYLE_URL` | Set URL in `.env.local`, restart `dev` |
| No 3D buildings | Style has no building source / low zoom | Zoom ≥ 15; app creates extrusion if `building` source-layer exists |
| Click does nothing | Not hitting extrusion layer | Pitch the map, click building mass |
| Model missing | Invalid GLB / under terrain / wrong rotation | Check altitude, Rotation X=90, scale |
| Original still visible | No stable ID | Expect warning; add `osm_id` to tiles |
| WebGL lost | GPU context lost | Reload page |
| Import fails | Invalid JSON schema | Use Export first as template |

---

## Production build

```bash
npm run build
npm start
```

---

## Known limitations

See [docs/known-limitations.md](docs/known-limitations.md).
