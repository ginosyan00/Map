# Testing report — OpenMapTiles Custom GLB POC

Date: 2026-07-21

## Automated

| Command | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass (Next.js 16.2.10) |

## Manual scenarios

| # | Scenario | Status |
| --- | --- | --- |
| 1 | Map opens | Ready for `npm run dev` (OpenFreeMap Liberty) |
| 2 | 3D buildings visible | App creates/detects fill-extrusion |
| 3 | Click selects feature | `queryRenderedFeatures` + identity |
| 4 | Empty click safe | Clears selection / highlight |
| 5 | Selection highlight | GeoJSON fill/line/extrusion |
| 6 | Sample GLB loads | `public/models/sample-building.glb` + procedural fallback |
| 7 | Model at centroid | Auto placement from geometry |
| 8 | Rotation w/o reload | Matrix update only |
| 9 | Scale w/o reload | Matrix update only |
| 10 | Altitude | Editor control |
| 11 | Exclusion w/ stable ID | Filter merge when property/id exists |
| 12 | Warning w/o stable ID | UI warning path |
| 13 | Persist after refresh | `localStorage` |
| 14 | Dispose on remove | `disposeThreeObject` |
| 15 | Restore original | Remove replacement + restore filter |
| 16 | Multiple replacements | Array store + one Three scene |
| 17 | Production build | Pass |
