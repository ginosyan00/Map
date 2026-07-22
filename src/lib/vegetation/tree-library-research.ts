/**
 * Static research summary exported for docs / debug — not a runtime dependency list.
 * Selected approach: Three.js InstancedMesh + GLTFLoader + procedural fallback.
 * No new npm packages.
 */
export const TREE_LIBRARY_RESEARCH = {
  selected: ["three", "GLTFLoader", "InstancedMesh"] as const,
  deferred: ["DRACOLoader", "KTX2Loader", "MeshoptDecoder"] as const,
  rejected: ["random-npm-tree-generators", "three-mesh-bvh-for-draw", "3d-tiles-renderer-v1"] as const,
  rationale:
    "Reuse installed three@0.185 + MapLibre custom-layer shared context; avoid unmaintained tree packages.",
} as const;
