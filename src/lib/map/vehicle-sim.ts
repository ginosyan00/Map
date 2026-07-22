import type { RoadLine } from "./overpass-roads";
import { CAR_MODEL_URLS } from "@/lib/three/load-car-models";

export type Vehicle = {
  id: string;
  roadId: string;
  distanceM: number;
  speedMps: number;
  modelIndex: number;
  lng: number;
  lat: number;
  bearing: number;
};

/** Same speed for every car (m/s). */
const SPEED_MPS = 8;

/** Minimum bumper-to-bumper gap along a road (car ~4.5 m + clearance). */
const MIN_GAP_M = 14;

/** Spawn interval — always ≥ MIN_GAP_M. */
const SPACING_M = 18;

export const MAX_VEHICLES = 2_500;
const MIN_VEHICLES = 80;

/**
 * Build fleet once with fixed gaps and identical speed.
 */
export function createVehicles(roads: RoadLine[]): Vehicle[] {
  if (roads.length === 0) return [];

  const vehicles: Vehicle[] = [];
  const modelCount = CAR_MODEL_URLS.length;
  const pool = [...roads].sort((a, b) => b.lengthM - a.lengthM);

  for (const road of pool) {
    if (vehicles.length >= MAX_VEHICLES) break;
    if (road.lengthM < SPACING_M + MIN_GAP_M) continue;

    const startInset = SPACING_M * 0.5;
    for (let d = startInset; d <= road.lengthM - startInset; d += SPACING_M) {
      if (vehicles.length >= MAX_VEHICLES) break;
      const sample = sampleAlongRoad(road, d);
      vehicles.push({
        id: `car-${vehicles.length}`,
        roadId: road.id,
        distanceM: d,
        speedMps: SPEED_MPS,
        modelIndex: vehicles.length % modelCount,
        lng: sample.lng,
        lat: sample.lat,
        bearing: sample.bearing,
      });
    }
  }

  if (vehicles.length < MIN_VEHICLES) {
    for (const road of pool) {
      if (vehicles.length >= MIN_VEHICLES || vehicles.length >= MAX_VEHICLES) break;
      if (road.lengthM < MIN_GAP_M * 2) continue;
      for (let d = MIN_GAP_M; d < road.lengthM - MIN_GAP_M; d += SPACING_M) {
        if (vehicles.length >= MAX_VEHICLES) break;
        if (isOccupied(vehicles, road.id, d, MIN_GAP_M)) continue;
        const sample = sampleAlongRoad(road, d);
        vehicles.push({
          id: `car-${vehicles.length}`,
          roadId: road.id,
          distanceM: d,
          speedMps: SPEED_MPS,
          modelIndex: vehicles.length % modelCount,
          lng: sample.lng,
          lat: sample.lat,
          bearing: sample.bearing,
        });
      }
    }
  }

  // Final pass: identical speed + hard gaps.
  for (const car of vehicles) {
    car.speedMps = SPEED_MPS;
  }
  enforceGaps(vehicles, roads);
  refreshPoses(vehicles, new Map(roads.map((r) => [r.id, r])));
  return vehicles;
}

export function targetCount(roads: RoadLine[]): number {
  if (roads.length === 0) return 0;
  const totalM = roads.reduce((sum, r) => sum + r.lengthM, 0);
  return Math.min(MAX_VEHICLES, Math.max(MIN_VEHICLES, Math.floor(totalM / SPACING_M)));
}

/**
 * Equal-speed tick + per-road gap enforcement so cars never touch.
 */
export function tickVehiclesInPlace(
  vehicles: Vehicle[],
  roadsById: Map<string, RoadLine>,
  roadList: RoadLine[],
  dtSec: number,
): void {
  if (roadList.length === 0 || roadsById.size === 0) return;

  for (let i = 0; i < vehicles.length; i++) {
    const car = vehicles[i]!;
    car.speedMps = SPEED_MPS;

    let road = roadsById.get(car.roadId);
    if (!road) {
      road = roadList[(Math.random() * roadList.length) | 0]!;
      const slot = findFreeSlot(vehicles, road, car.id);
      car.roadId = road.id;
      car.distanceM = slot;
    }

    car.distanceM += SPEED_MPS * dtSec;

    if (car.distanceM >= road.lengthM) {
      const next = pickConnectedOrRandom(road, roadList);
      const slot = findFreeSlot(vehicles, next, car.id);
      car.roadId = next.id;
      car.distanceM = slot;
      road = next;
      if (!roadsById.has(next.id)) roadsById.set(next.id, next);
    }
  }

  enforceGaps(vehicles, roadList);
  refreshPoses(vehicles, roadsById);
}

function findFreeSlot(vehicles: Vehicle[], road: RoadLine, selfId: string): number {
  const others = vehicles.filter((v) => v.roadId === road.id && v.id !== selfId);
  if (others.length === 0) {
    return Math.min(road.lengthM * 0.2, SPACING_M);
  }

  // Prefer the first free interval from the start that fits MIN_GAP_M on both sides.
  const sorted = [...others].sort((a, b) => a.distanceM - b.distanceM);
  let candidate = MIN_GAP_M * 0.5;
  for (const other of sorted) {
    if (other.distanceM - candidate >= MIN_GAP_M) {
      return candidate;
    }
    candidate = other.distanceM + MIN_GAP_M;
  }
  if (candidate + MIN_GAP_M * 0.5 <= road.lengthM) {
    return Math.min(candidate, road.lengthM - MIN_GAP_M * 0.5);
  }

  // Road full — place just behind the last car (still gapped).
  const last = sorted[sorted.length - 1]!;
  return Math.max(0, last.distanceM - MIN_GAP_M);
}

/**
 * On each road: sort by distance, clamp followers so gap ≥ MIN_GAP_M.
 * Leader = highest distanceM (further along the road).
 */
function enforceGaps(vehicles: Vehicle[], roads: RoadLine[]): void {
  const roadLen = new Map(roads.map((r) => [r.id, r.lengthM]));
  const byRoad = new Map<string, Vehicle[]>();

  for (const car of vehicles) {
    const list = byRoad.get(car.roadId);
    if (list) list.push(car);
    else byRoad.set(car.roadId, [car]);
  }

  for (const [, group] of byRoad) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.distanceM - a.distanceM); // leaders first
    for (let i = 1; i < group.length; i++) {
      const leader = group[i - 1]!;
      const follower = group[i]!;
      const maxDist = leader.distanceM - MIN_GAP_M;
      if (follower.distanceM > maxDist) {
        follower.distanceM = Math.max(0, maxDist);
      }
    }
    // Keep everyone on the segment.
    const len = roadLen.get(group[0]!.roadId) ?? Number.POSITIVE_INFINITY;
    for (const car of group) {
      car.distanceM = Math.min(car.distanceM, Math.max(0, len - 0.05));
      car.speedMps = SPEED_MPS;
    }
  }
}

function isOccupied(
  vehicles: Vehicle[],
  roadId: string,
  distanceM: number,
  gap: number,
): boolean {
  return vehicles.some(
    (v) => v.roadId === roadId && Math.abs(v.distanceM - distanceM) < gap,
  );
}

function refreshPoses(vehicles: Vehicle[], roadsById: Map<string, RoadLine>): void {
  for (const car of vehicles) {
    const road = roadsById.get(car.roadId);
    if (!road) continue;
    const sample = sampleAlongRoad(road, car.distanceM);
    car.lng = sample.lng;
    car.lat = sample.lat;
    car.bearing = sample.bearing;
  }
}

function pickConnectedOrRandom(current: RoadLine, roads: RoadLine[]): RoadLine {
  if (roads.length === 1) return roads[0]!;
  const end = current.coords[current.coords.length - 1];
  if (!end) return roads[(Math.random() * roads.length) | 0]!;

  let best: RoadLine | null = null;
  let bestDist = 40;
  const stride = Math.max(1, (roads.length / 80) | 0);
  const start = (Math.random() * roads.length) | 0;
  for (let n = 0; n < roads.length; n += stride) {
    const other = roads[(start + n) % roads.length]!;
    if (other.id === current.id) continue;
    const a = other.coords[0];
    const b = other.coords[other.coords.length - 1];
    if (!a || !b) continue;
    const d = Math.min(approxMeters(end, a), approxMeters(end, b));
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  if (best) return best;
  let next = roads[(Math.random() * roads.length) | 0]!;
  if (next.id === current.id && roads.length > 1) {
    next = roads[(roads.indexOf(next) + 1) % roads.length]!;
  }
  return next;
}

function sampleAlongRoad(
  road: RoadLine,
  distanceM: number,
): { lng: number; lat: number; bearing: number } {
  const coords = road.coords;
  if (coords.length < 2) {
    const p = coords[0] ?? [0, 0];
    return { lng: p[0], lat: p[1], bearing: 0 };
  }

  let remaining = Math.max(0, Math.min(distanceM, road.lengthM - 0.01));
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = approxMeters(a, b);
    if (remaining <= seg || i === coords.length - 1) {
      const t = seg > 0 ? remaining / seg : 0;
      return {
        lng: a[0] + (b[0] - a[0]) * t,
        lat: a[1] + (b[1] - a[1]) * t,
        bearing: bearingDeg(a, b),
      };
    }
    remaining -= seg;
  }

  const last = coords[coords.length - 1]!;
  const prev = coords[coords.length - 2]!;
  return { lng: last[0], lat: last[1], bearing: bearingDeg(prev, last) };
}

function approxMeters(a: [number, number], b: [number, number]): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(midLat) * 111_320;
  const dy = (b[1] - a[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
