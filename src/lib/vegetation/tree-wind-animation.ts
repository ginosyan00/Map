/**
 * Wind is intentionally a no-op stub for phase 1.
 * Static trees are preferred over risky material shader patches.
 * High-quality presets can enable a future shared-uniform canopy sway.
 */
export type WindController = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  tick: (timeSec: number) => void;
  dispose: () => void;
};

export function createTreeWindController(initial = false): WindController {
  let enabled = initial;
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(next: boolean) {
      enabled = next;
    },
    tick() {
      /* reserved for shared wind uniform */
    },
    dispose() {
      enabled = false;
    },
  };
}
