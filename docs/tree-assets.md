# Tree Assets

## Policy

No third-party tree GLB with unclear license was committed.  
First ship uses **procedural Three.js geometry** generated at runtime (and optionally exported via script). Architecture accepts GLB URLs when licensed assets are added.

## Current assets

| Asset | Format | Source | License | Notes |
| --- | --- | --- | --- | --- |
| Procedural deciduous | Runtime geometry | Project code (`tree-model-loader.ts`) | Same as project | Trunk cylinder + sphere canopy |
| Procedural compact | Runtime geometry | Project code | Same as project | Shorter trunk, wider canopy |
| Procedural conifer | Runtime geometry | Project code | Same as project | Trunk + cone canopy |

Optional on-disk placeholders (if generated):

| Path | License |
| --- | --- |
| `public/models/trees/deciduous-tree-low.glb` | Project-generated (MIT project) |
| `public/models/trees/compact-tree-low.glb` | Project-generated |
| `public/models/trees/conifer-tree-low.glb` | Project-generated |

## Requirements for future GLBs

- Origin at trunk base center; 1 unit = 1 m
- Applied transforms; no bones/clips unless needed
- Low/medium poly (mobile 300–1500 tris; desktop 1500–6000)
- Textures ≤ 1024²; prefer alphaTest leaves; KTX2 when pipeline supports

## Adding a licensed GLB

1. Place file under `public/models/trees/`.
2. Document source + license in this file.
3. Point `TREE_SPECIES_ASSETS` URL in `vegetation-config.ts`.
4. Loader falls back to procedural if fetch fails.
