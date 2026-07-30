"use client";

import { useState } from "react";
import type { CustomBuildingModel } from "@/types/building";

type FieldKey = keyof Pick<
  CustomBuildingModel,
  "altitude" | "rotationY" | "scale" | "rotationX" | "rotationZ" | "minZoom" | "longitude" | "latitude"
>;

type FieldDef = {
  key: FieldKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

const PRIMARY: FieldDef[] = [
  { key: "altitude", label: "Height offset", min: -50, max: 500, step: 0.5 },
  { key: "rotationY", label: "Turn", min: -180, max: 180, step: 1 },
  { key: "scale", label: "Scale", min: 0.05, max: 20, step: 0.05 },
];

const MORE: FieldDef[] = [
  { key: "rotationX", label: "Tilt X", min: -180, max: 180, step: 1 },
  { key: "rotationZ", label: "Tilt Z", min: -180, max: 180, step: 1 },
  { key: "longitude", label: "Longitude", min: -180, max: 180, step: 0.000001 },
  { key: "latitude", label: "Latitude", min: -90, max: 90, step: 0.000001 },
  { key: "minZoom", label: "Min zoom", min: 0, max: 22, step: 0.5 },
];

type Props = {
  model: CustomBuildingModel;
  onChange: (patch: Partial<CustomBuildingModel>) => void;
  onReset: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number): number {
  const decimals = String(step).includes(".") ? String(step).split(".")[1]?.length ?? 0 : 0;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimals));
}

function Field({
  field,
  model,
  onChange,
}: {
  field: FieldDef;
  model: CustomBuildingModel;
  onChange: (patch: Partial<CustomBuildingModel>) => void;
}) {
  const value = Number(model[field.key]);
  const decimals = field.step < 0.01 ? 5 : 2;

  const nudge = (direction: -1 | 1) => {
    const next = roundToStep(value + direction * field.step, field.step);
    onChange({ [field.key]: clamp(next, field.min, field.max) });
  };

  return (
    <div className="field">
      <div className="field-label">
        <span>{field.label}</span>
        <div className="field-stepper">
          <button
            type="button"
            className="stepper-btn"
            aria-label={`Decrease ${field.label}`}
            disabled={value <= field.min}
            onClick={() => nudge(-1)}
          >
            −
          </button>
          <span className="field-value">{value.toFixed(decimals)}</span>
          <button
            type="button"
            className="stepper-btn"
            aria-label={`Increase ${field.label}`}
            disabled={value >= field.max}
            onClick={() => nudge(1)}
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(event) => onChange({ [field.key]: Number(event.target.value) })}
      />
    </div>
  );
}

export function TransformControls({ model, onChange, onReset }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="stack">
      {PRIMARY.map((field) => (
        <Field key={field.key} field={field} model={model} onChange={onChange} />
      ))}

      <button type="button" className="btn tiny ghost" onClick={() => setMoreOpen((v) => !v)}>
        {moreOpen ? "Fewer controls" : "More controls"}
      </button>

      {moreOpen
        ? MORE.map((field) => (
            <Field key={field.key} field={field} model={model} onChange={onChange} />
          ))
        : null}

      <label className="graphic-toggle">
        <input
          type="checkbox"
          checked={model.visible}
          onChange={(event) => onChange({ visible: event.target.checked })}
        />
        Show on map
      </label>

      <button type="button" className="btn ghost" onClick={onReset}>
        Reset transform
      </button>
    </div>
  );
}
