import type { VegetationQualityPreset } from "@/types/vegetation";

export type LodDecision = {
  visible: boolean;
  /** Always 1 for layout — count must not change with zoom. */
  densityScale: number;
  label: "hidden" | "stable" | "low" | "medium" | "high";
};

/**
 * Zoom only toggles visibility. Density/count stays fixed once generated.
 */
export function resolveTreeLod(
  zoom: number,
  minZoom: number,
  quality: VegetationQualityPreset,
): LodDecision {
  if (zoom < minZoom - 0.15) {
    return { visible: false, densityScale: 1, label: "hidden" };
  }
  return {
    visible: true,
    densityScale: 1,
    label: quality.lod,
  };
}
