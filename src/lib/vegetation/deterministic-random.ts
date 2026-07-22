/**
 * Mulberry32 seeded PRNG — deterministic across sessions for the same seed.
 */
export function createSeededRandom(seed: string): () => number {
  let state = hashStringToUint32(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToUint32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

export function pickWeightedSpecies(
  rand: () => number,
  weights: Record<string, number>,
): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] ?? "deciduous";
}
