# 3D Tree Performance Report

Date: 2026-07-22

## Method

Measured during local `npm run build` + manual desktop run. Automated FPS capture was not instrumented in CI; numbers below are **structural budgets** and **generation-time** expectations. Do not treat FPS rows as lab-certified until a debug panel frame timer is sampled on target hardware.

## Budgets (targets)

| Device | FPS target | Visible instances | Shadows | Wind |
| --- | --- | --- | --- | --- |
| Desktop | 55–60 | ≤ 400 | off (default) | off |
| Tablet | 40–60 | ≤ 200 | off | off |
| Mobile | ≥ 30 | ≤ 100 | off | off |

## Draw-call model

- 3 species × 2 parts (trunk + canopy) ≈ **6 InstancedMesh draw calls** when all species present.
- One GLB/procedural template load per species (cached).
- No per-tree mesh clone; no per-frame geometry rebuild.

## Generation

- Sampling + exclusions run on moveend debounce (~400 ms), not per frame.
- Typical small urban park: tens of trees; large parks capped by `maxTreesPerFeature` × quality multiplier.

## Observed (dev session)

| Metric | Value | Notes |
| --- | --- | --- |
| New npm deps | 0 | Three.js already present |
| Typecheck / build | See regression report | |
| Tree-related draw calls | ≤ 6 | By design |
| Frame timer | Not automated | Use TreeDebugPanel in development |

## Risks

- Third custom WebGLRenderer on shared context increases `resetState` cost.
- Very large parks at zoom 18+ need density caps (already configured).
