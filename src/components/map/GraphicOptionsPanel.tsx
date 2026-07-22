"use client";

import { useState } from "react";
import type { GraphicOptions } from "@/hooks/useGraphicOptions";
import type { TimeOfDay, WeatherMode } from "@/lib/map/atmosphere";

type Props = {
  options: GraphicOptions;
  onChange: (partial: Partial<GraphicOptions>) => void;
  onResetF4View: () => void;
};

const TIMES: Array<{ id: TimeOfDay; label: string }> = [
  { id: "live", label: "Live" },
  { id: "night", label: "Night" },
  { id: "morning", label: "Morning" },
  { id: "noon", label: "Noon" },
  { id: "evening", label: "Evening" },
];

const WEATHERS: Array<{ id: WeatherMode; label: string }> = [
  { id: "sun", label: "Sun" },
  { id: "rain", label: "Rain" },
  { id: "snow", label: "Snow" },
];

export function GraphicOptionsPanel({ options, onChange, onResetF4View }: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="graphic-options-fab-wrap">
        <button
          type="button"
          className="graphic-options-fab"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Open graphic options"
        >
          Graphics
        </button>
      </div>
    );
  }

  return (
    <aside className="graphic-options" aria-label="Graphic options">
      <header className="graphic-options-header">
        <h2>Graphic options</h2>
        <div className="graphic-options-actions">
          <button type="button" className="btn tiny ghost" onClick={onResetF4View}>
            F4 view
          </button>
          <button
            type="button"
            className="btn tiny ghost"
            onClick={() => setOpen(false)}
            aria-label="Close graphic options"
          >
            Close
          </button>
        </div>
      </header>

      <section className="graphic-section">
        <h3>Ground elevations</h3>
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={options.groundElevations}
            onChange={(e) => onChange({ groundElevations: e.target.checked })}
          />
          Enable terrain
        </label>
        <label className="graphic-range">
          Exaggeration
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.1}
            disabled={!options.groundElevations}
            value={options.terrainExaggeration}
            onChange={(e) => onChange({ terrainExaggeration: Number(e.target.value) })}
          />
          <span>{options.terrainExaggeration.toFixed(1)}×</span>
        </label>
      </section>

      <section className="graphic-section">
        <h3>Weather</h3>
        <div className="graphic-chips">
          {WEATHERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${options.weather === item.id ? "active" : ""}`}
              onClick={() => onChange({ weather: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="graphic-section">
        <h3>Time</h3>
        <div className="graphic-chips">
          {TIMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${options.timeOfDay === item.id ? "active" : ""}`}
              onClick={() => onChange({ timeOfDay: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="graphic-section">
        <h3>Traffic</h3>
        <p className="muted small">
          Cars / boats are not available on MapLibre (F4 proprietary).
        </p>
        <div className="graphic-chips">
          <button type="button" className="chip" disabled>
            Cars
          </button>
          <button type="button" className="chip" disabled>
            Boats
          </button>
        </div>
      </section>

      <section className="graphic-section">
        <h3>Display</h3>
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={options.showLabels}
            onChange={(e) => onChange({ showLabels: e.target.checked })}
          />
          Labels
        </label>
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={options.showBuildings}
            onChange={(e) => onChange({ showBuildings: e.target.checked })}
          />
          Buildings
        </label>
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={options.showSky}
            onChange={(e) => onChange({ showSky: e.target.checked })}
          />
          Sky / atmosphere
        </label>
        <label className="graphic-toggle">
          <input
            type="checkbox"
            checked={options.idleOrbit}
            onChange={(e) => onChange({ idleOrbit: e.target.checked })}
          />
          Idle orbit animation
        </label>
      </section>
    </aside>
  );
}
