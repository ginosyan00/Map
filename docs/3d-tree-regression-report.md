# 3D Tree Regression Report

Date: 2026-07-22

## Checklist

| # | Check | Result |
| --- | --- | --- |
| 1 | Map boots | Pending local verify |
| 2 | Building selection | Untouched path |
| 3 | GLB building replacement | Untouched path |
| 4 | 2D park/tree POI icons hidden | `hideParkTreeSymbols` + existing basemap POI hide |
| 5 | Park polygon detection | `park` / `landcover` / `landuse` via `querySourceFeatures` |
| 6 | ≥1 3D tree georeferenced | InstancedMesh local meters |
| 7 | Trees inside polygon | Poisson + inset |
| 8 | Not on roads | Road buffer exclusion |
| 9 | Not on buildings | Building ring exclusion |
| 10 | Stable after refresh | Seeded RNG |
| 11 | No ground slide on zoom | Reproject each frame from lng/lat |
| 12 | Pitch/bearing OK | Shared custom-layer projection |
| 13 | Model load once | Template cache |
| 14 | Instance count respects config | Caps + quality |
| 15 | No duplicate layer | `ensureVegetationLayer` |
| 16 | Mobile budget | low quality preset |
| 17 | Reduced motion | Wind off (wind stub disabled) |
| 18 | Cleanup | attach destroy removes layer/listeners |
| 19 | TypeScript | `npm run typecheck` |
| 20 | Production build | `npm run build` |

## Commands

```bash
npm run lint
npm run typecheck
npm run build
```

### Results (2026-07-22)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 errors) |
| `npm run build` | Pass (Next.js 16.2.10) |

Screenshots under `docs/screenshots/` require a local visual pass against a park at zoom ≥ 15.5; capture after `npm run dev`.
