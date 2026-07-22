# Tree models

Procedural trees are generated at runtime by default (`TRY_GLB_ASSETS = false`).

To use on-disk GLBs:

1. Add licensed or project-generated files:
   - `deciduous-tree-low.glb`
   - `compact-tree-low.glb`
   - `conifer-tree-low.glb`
2. Document license in `docs/tree-assets.md`
3. Set `TRY_GLB_ASSETS = true` in `src/lib/vegetation/tree-model-loader.ts`
