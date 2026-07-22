import type { ExpressionSpecification } from "maplibre-gl";

/**
 * Height expression used for extrusion and for height-tinted colors.
 */
export const BUILDING_HEIGHT_EXPR: ExpressionSpecification = [
  "coalesce",
  ["get", "render_height"],
  ["get", "height"],
  ["*", ["coalesce", ["get", "building:levels"], 3], 3],
  10,
];

export const BUILDING_MIN_HEIGHT_EXPR: ExpressionSpecification = [
  "coalesce",
  ["get", "render_min_height"],
  ["get", "min_height"],
  0,
];

/**
 * Soft height tint: low houses stay warm-white, towers cool slightly.
 * `base` is the time-of-day / style base color.
 */
export function buildingColorByHeight(base: string): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    BUILDING_HEIGHT_EXPR,
    0,
    base,
    12,
    base,
    35,
    shadeHex(base, -0.04),
    70,
    shadeHex(base, -0.08),
    120,
    shadeHex(base, -0.12),
  ];
}

/**
 * First-render grow-in: extrusions rise smoothly between z14–z16 instead of popping.
 */
export function buildingHeightWithZoomGrow(
  heightExpr: ExpressionSpecification = BUILDING_HEIGHT_EXPR,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    14,
    0,
    14.6,
    ["*", heightExpr, 0.35],
    15.4,
    ["*", heightExpr, 0.75],
    16,
    heightExpr,
  ];
}

export function buildingBaseWithZoomGrow(
  baseExpr: ExpressionSpecification = BUILDING_MIN_HEIGHT_EXPR,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    14,
    0,
    15.4,
    ["*", baseExpr, 0.5],
    16,
    baseExpr,
  ];
}

/** Darken or lighten a #rrggbb color by factor (−1…1). */
function shadeHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const t = (c: number) => {
    const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return `#${[t(r), t(g), t(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
