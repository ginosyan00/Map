import { createSeededRandom } from "./deterministic-random";

export type LngLat = [number, number];
export type MeterPoint = { x: number; y: number };

export type SamplingResult = {
  points: LngLat[];
  attempted: number;
  rejected: number;
};

/**
 * Deterministic Poisson-disc sampling inside a polygon (lng/lat),
 * with edge padding in meters.
 */
export function samplePolygonPoisson(opts: {
  ring: LngLat[];
  holes?: LngLat[][];
  minSpacingM: number;
  edgePaddingM: number;
  maxPoints: number;
  seed: string;
}): SamplingResult {
  const { ring, holes = [], minSpacingM, edgePaddingM, maxPoints, seed } = opts;
  if (ring.length < 3 || maxPoints <= 0) {
    return { points: [], attempted: 0, rejected: 0 };
  }

  const origin = ringCentroid(ring);
  const outer = ringToMeters(ring, origin);
  const holeMeters = holes.map((h) => ringToMeters(h, origin));
  const inset = insetPolygonApprox(outer, edgePaddingM);
  if (inset.length < 3) {
    return { points: [], attempted: 0, rejected: 0 };
  }

  const bounds = bboxOf(inset);
  const cell = minSpacingM / Math.SQRT2;
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cell));
  const grid: Array<MeterPoint | null> = new Array(cols * rows).fill(null);
  const rand = createSeededRandom(seed);
  const active: MeterPoint[] = [];
  const accepted: MeterPoint[] = [];
  let attempted = 0;
  let rejected = 0;

  const seedPoint = findFirstPoint(inset, holeMeters, rand, 40);
  if (!seedPoint) {
    return { points: [], attempted: 40, rejected: 40 };
  }
  place(seedPoint);

  const k = 20;
  while (active.length > 0 && accepted.length < maxPoints) {
    const idx = Math.floor(rand() * active.length);
    const center = active[idx]!;
    let found = false;
    for (let n = 0; n < k; n++) {
      attempted++;
      const angle = rand() * Math.PI * 2;
      const radius = minSpacingM * (1 + rand());
      const candidate: MeterPoint = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
      if (!pointInRing(candidate, inset)) {
        rejected++;
        continue;
      }
      if (holeMeters.some((h) => pointInRing(candidate, h))) {
        rejected++;
        continue;
      }
      if (!farEnough(candidate, grid, cols, rows, bounds, cell, minSpacingM)) {
        rejected++;
        continue;
      }
      place(candidate);
      found = true;
      break;
    }
    if (!found) {
      active.splice(idx, 1);
    }
  }

  return {
    points: accepted.map((p) => metersToLngLat(p, origin)),
    attempted,
    rejected,
  };

  function place(p: MeterPoint): void {
    accepted.push(p);
    active.push(p);
    const gx = Math.floor((p.x - bounds.minX) / cell);
    const gy = Math.floor((p.y - bounds.minY) / cell);
    if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
      grid[gy * cols + gx] = p;
    }
  }
}

export function ringCentroid(ring: LngLat[]): LngLat {
  let x = 0;
  let y = 0;
  const n = ring.length - (ringSame(ring[0]!, ring[ring.length - 1]!) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    x += ring[i]![0];
    y += ring[i]![1];
  }
  return [x / Math.max(1, n), y / Math.max(1, n)];
}

export function polygonAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const origin = ringCentroid(ring);
  const meters = ringToMeters(ring, origin);
  let sum = 0;
  for (let i = 0; i < meters.length; i++) {
    const a = meters[i]!;
    const b = meters[(i + 1) % meters.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

export function pointInRing(p: MeterPoint, ring: MeterPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.x;
    const yi = ring[i]!.y;
    const xj = ring[j]!.x;
    const yj = ring[j]!.y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function lngLatToLocalMeters(
  originLng: number,
  originLat: number,
  lng: number,
  lat: number,
): MeterPoint {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  return {
    x: (lng - originLng) * 111_320 * cosLat,
    y: (lat - originLat) * 110_540,
  };
}

export function ringToMeters(ring: LngLat[], origin: LngLat): MeterPoint[] {
  const closed = ringSame(ring[0]!, ring[ring.length - 1]!) ? ring.slice(0, -1) : ring;
  return closed.map((c) => lngLatToLocalMeters(origin[0], origin[1], c[0], c[1]));
}

function metersToLngLat(p: MeterPoint, origin: LngLat): LngLat {
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  return [origin[0] + p.x / (111_320 * cosLat), origin[1] + p.y / 110_540];
}

function ringSame(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
}

function bboxOf(ring: MeterPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Approximate inset by pushing vertices toward centroid. */
function insetPolygonApprox(ring: MeterPoint[], padM: number): MeterPoint[] {
  if (padM <= 0) return ring;
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
  }
  cx /= ring.length;
  cy /= ring.length;
  const out: MeterPoint[] = [];
  for (const p of ring) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.max(0.15, (len - padM) / len);
    out.push({ x: cx + dx * scale, y: cy + dy * scale });
  }
  return out;
}

function findFirstPoint(
  inset: MeterPoint[],
  holes: MeterPoint[][],
  rand: () => number,
  tries: number,
): MeterPoint | null {
  const b = bboxOf(inset);
  for (let i = 0; i < tries; i++) {
    const p = {
      x: b.minX + rand() * (b.maxX - b.minX),
      y: b.minY + rand() * (b.maxY - b.minY),
    };
    if (pointInRing(p, inset) && !holes.some((h) => pointInRing(p, h))) return p;
  }
  return inset[0] ?? null;
}

function farEnough(
  p: MeterPoint,
  grid: Array<MeterPoint | null>,
  cols: number,
  rows: number,
  bounds: { minX: number; minY: number },
  cell: number,
  minDist: number,
): boolean {
  const gx = Math.floor((p.x - bounds.minX) / cell);
  const gy = Math.floor((p.y - bounds.minY) / cell);
  const minD2 = minDist * minDist;
  for (let y = gy - 2; y <= gy + 2; y++) {
    for (let x = gx - 2; x <= gx + 2; x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const other = grid[y * cols + x];
      if (!other) continue;
      const d2 = (other.x - p.x) ** 2 + (other.y - p.y) ** 2;
      if (d2 < minD2) return false;
    }
  }
  return true;
}

/**
 * Uniform jittered grid across the full polygon bbox.
 * IMPORTANT: does not early-stop mid-grid — caller should set maxPoints high
 * enough to cover area / spacing², otherwise only the first rows fill.
 */
export function samplePolygonGrid(opts: {
  ring: LngLat[];
  holes?: LngLat[][];
  spacingM: number;
  edgePaddingM: number;
  maxPoints: number;
  seed: string;
}): SamplingResult {
  const { ring, holes = [], spacingM, edgePaddingM, maxPoints, seed } = opts;
  if (ring.length < 3 || maxPoints <= 0 || spacingM <= 0) {
    return { points: [], attempted: 0, rejected: 0 };
  }

  const origin = ringCentroid(ring);
  const outer = ringToMeters(ring, origin);
  const holeMeters = holes.map((h) => ringToMeters(h, origin));
  const bounds = bboxOf(outer);
  const rand = createSeededRandom(seed);
  const accepted: MeterPoint[] = [];
  let attempted = 0;
  let rejected = 0;

  const pad = Math.max(0, edgePaddingM);
  const minX = bounds.minX + pad;
  const maxX = bounds.maxX - pad;
  const minY = bounds.minY + pad;
  const maxY = bounds.maxY - pad;
  if (maxX <= minX || maxY <= minY) {
    return { points: [], attempted: 0, rejected: 0 };
  }

  // Guarantee enough rows/cols to span the full green footprint.
  const width = maxX - minX;
  const height = maxY - minY;
  const cols = Math.max(2, Math.ceil(width / spacingM));
  const rows = Math.max(2, Math.ceil(height / spacingM));
  const stepX = width / cols;
  const stepY = height / rows;
  const jitter = Math.min(stepX, stepY) * 0.28;

  // Collect all valid cells first, then trim evenly if over budget.
  const candidates: MeterPoint[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      attempted++;
      const candidate: MeterPoint = {
        x: minX + (col + 0.5) * stepX + (rand() - 0.5) * 2 * jitter,
        y: minY + (row + 0.5) * stepY + (rand() - 0.5) * 2 * jitter,
      };
      if (!pointInRing(candidate, outer)) {
        rejected++;
        continue;
      }
      if (holeMeters.some((h) => pointInRing(candidate, h))) {
        rejected++;
        continue;
      }
      candidates.push(candidate);
    }
  }

  if (candidates.length <= maxPoints) {
    return {
      points: candidates.map((p) => metersToLngLat(p, origin)),
      attempted,
      rejected,
    };
  }

  // Even subsample across the full set (keeps coverage, reduces density).
  const used = new Set<number>();
  const step = candidates.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    let idx = Math.min(candidates.length - 1, Math.floor(i * step));
    while (used.has(idx) && used.size < candidates.length) {
      idx = (idx + 1) % candidates.length;
    }
    used.add(idx);
    accepted.push(candidates[idx]!);
  }

  return {
    points: accepted.map((p) => metersToLngLat(p, origin)),
    attempted,
    rejected,
  };
}
