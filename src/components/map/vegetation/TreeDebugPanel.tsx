"use client";

import { useEffect, useState } from "react";
import type { VegetationDebugSnapshot } from "@/types/vegetation";

type Props = {
  getDebug: () => VegetationDebugSnapshot;
  onRegenerate: () => void;
  onToggle: (enabled: boolean) => void;
  onDensity: (densityPerHectare: number) => void;
};

/**
 * Development-only vegetation debug panel.
 */
export function TreeDebugPanel({ getDebug, onRegenerate, onToggle, onDensity }: Props) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<VegetationDebugSnapshot | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const id = window.setInterval(() => setSnap(getDebug()), 800);
    return () => window.clearInterval(id);
  }, [getDebug]);

  if (process.env.NODE_ENV !== "development") return null;

  if (!open) {
    return (
      <button
        type="button"
        className="graphic-options-fab"
        style={{ bottom: 72, right: 16 }}
        onClick={() => setOpen(true)}
      >
        Trees debug
      </button>
    );
  }

  const d = snap;

  return (
    <aside
      className="graphic-options"
      style={{ maxHeight: "70vh", overflow: "auto", bottom: 16, right: 16 }}
      aria-label="Vegetation debug"
    >
      <header className="graphic-options-header">
        <h2>Vegetation</h2>
        <button type="button" className="btn tiny ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </header>

      <section className="graphic-section">
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={d?.enabled ?? true}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Enable 3D trees
        </label>
        <label className="graphic-range">
          Density / ha
          <input
            type="range"
            min={20}
            max={180}
            step={5}
            value={d?.requestedDensity ?? 95}
            onChange={(e) => onDensity(Number(e.target.value))}
          />
          <span>{d?.requestedDensity ?? 95}</span>
        </label>
        <button type="button" className="btn tiny" onClick={onRegenerate}>
          Regenerate
        </button>
      </section>

      <section className="graphic-section">
        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0 }}>
          {JSON.stringify(
            {
              parkLayer: d?.parkLayer,
              parkFeatureId: d?.parkFeatureId,
              parkCount: d?.parkCount,
              areaM2: Math.round(d?.polygonAreaM2 ?? 0),
              trees: d?.generatedTreeCount,
              rejected: d?.rejectedPointCount,
              species: d?.speciesCounts,
              lod: d?.currentLod,
              zoom: d?.currentZoom?.toFixed?.(2),
              drawCalls: d?.drawCalls,
              tris: d?.triangleEstimate,
              models: d?.modelLoading,
              wind: d?.windEnabled,
              shadows: d?.shadowsEnabled,
              quality: d?.quality,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </aside>
  );
}
