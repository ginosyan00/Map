# 3D Tree Library Research

Date: 2026-07-22  
Sources: Three.js official docs, MapLibre GL JS docs/examples, npm package metadata, project `package.json` (three@0.185.1, maplibre-gl@5.24.0).

## Decision

**No new npm dependency.** Use already-installed Three.js (`InstancedMesh`, `GLTFLoader`, procedural primitives) on MapLibre’s shared WebGL custom-layer pattern. Optional Draco/KTX2/Meshopt stay available as future add-ons when compressed GLB assets land.

## Comparison

| Library | Purpose | Maintained | TS | License | Bundle impact | MapLibre shared-context | InstancedMesh / variation | Selected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Three.js** (in repo) | Scene, InstancedMesh, materials | Yes (mrdoob) | Yes (`@types/three`) | MIT | Already present | Yes (project pattern) | Native | **Yes** |
| **GLTFLoader** (three/addons) | Load tree GLB | Yes | Yes | MIT | Already used | N/A | Manual extract → InstancedMesh | **Yes** |
| **DRACOLoader** | Draco mesh decode | Yes | Yes | Apache-2.0 (Draco) + MIT | Decoder WASM extra | Compatible if shared once | N/A | Optional later |
| **KTX2Loader** | BasisU textures | Yes | Yes | MIT | Transcoder extra | Needs renderer detectSupport | N/A | Optional later |
| **MeshoptDecoder** | EXT_meshopt_compression | Yes | Yes | MIT | Small | Compatible | N/A | Optional later |
| **three-mesh-bvh** | Fast raycast / BVH | Active | Yes | MIT | Medium | Yes, but trees not selectable | Not for drawing | No |
| **three-instanced-uniforms-mesh** | Per-instance uniforms | Community | Partial | MIT | Extra | Possible | Color/phase helpers | No (use instanceColor if needed) |
| **3d-tiles-renderer** | Massive tiled content | NASA/Cesium ecosystem | Yes | Apache-2.0 | Large | Separate pipeline | Tile LODs | Future only |
| Random “tree generator” npm pkgs | Procedural trees | Often stale | Mixed | Mixed/unclear | Unknown | Risky | Rarely InstancedMesh | **No** |

## Evaluation notes

### Three.js InstancedMesh
- One draw call per geometry/material pair.
- `instanceMatrix` + optional `instanceColor`.
- `StaticDrawUsage` for fixed parks after rebuild.
- Fits hundreds of urban-park trees.

### GLTFLoader + compression stack
- Already used for buildings/cars without Draco/KTX2/Meshopt.
- Procedural placeholders avoid unclear model licenses.
- When shipping compressed GLBs: one shared DRACOLoader / KTX2Loader / MeshoptDecoder (iOS multi-instance pitfalls documented upstream).

### MapLibre CustomLayerInterface
- Official example: shared canvas + `WebGLRenderer({ context: gl })`, `autoClear = false`, `resetState()`, `renderingMode: "3d"`.
- Prefer `transform.getMatrixForModel` / `args.getMatrixForModel` when available; Mercator fallback matches vehicles/buildings.

### three-mesh-bvh
- Useful for picking; trees are non-interactive → skip.

### 3d-tiles-renderer
- Overkill for city-park vegetation density; reconsider for city-scale forests later.

### Procedural tree generators on npm
- Many unmaintained, unclear licenses, skinning/animation heavy, poor InstancedMesh fit.
- Rejected for production.

## Selected approach

1. Procedural species templates (trunk + canopy) with GLB load path ready.
2. One `threejs-vegetation-layer` custom layer.
3. InstancedMesh per species part.
4. Deterministic Poisson-disc sampling in-app (no Turf).
5. Quality presets; wind/shadows optional and off on low.
