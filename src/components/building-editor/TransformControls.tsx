"use client";

import type { CustomBuildingModel } from "@/types/building";

type FieldKey = keyof Pick<
  CustomBuildingModel,
  | "longitude"
  | "latitude"
  | "altitude"
  | "rotationX"
  | "rotationY"
  | "rotationZ"
  | "scale"
  | "minZoom"
>;

type FieldDef = {
  key: FieldKey;
  label: string;
  min: number;
  max: number;
  step: number;
  slider?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "longitude", label: "Longitude", min: -180, max: 180, step: 0.000001 },
  { key: "latitude", label: "Latitude", min: -90, max: 90, step: 0.000001 },
  { key: "altitude", label: "Altitude (m)", min: -50, max: 500, step: 0.5, slider: true },
  { key: "rotationX", label: "Rotation X (°)", min: -180, max: 180, step: 1, slider: true },
  { key: "rotationY", label: "Rotation Y (°)", min: -180, max: 180, step: 1, slider: true },
  { key: "rotationZ", label: "Rotation Z (°)", min: -180, max: 180, step: 1, slider: true },
  { key: "scale", label: "Uniform scale", min: 0.05, max: 20, step: 0.05, slider: true },
  { key: "minZoom", label: "Minimum zoom", min: 0, max: 22, step: 0.5, slider: true },
];

type Props = {
  model: CustomBuildingModel;
  onChange: (patch: Partial<CustomBuildingModel>) => void;
  onReset: () => void;
};

export function TransformControls({ model, onChange, onReset }: Props) {
  return (
    <div className="stack">
      {FIELDS.map((field) => {
        const value = model[field.key];
        return (
          <label key={field.key} className="field">
            <div className="field-label">
              <span>{field.label}</span>
              <button
                type="button"
                className="btn tiny ghost"
                onClick={() => {
                  const defaults: Partial<CustomBuildingModel> = {
                    altitude: 0,
                    rotationX: 90,
                    rotationY: 0,
                    rotationZ: 0,
                    scale: 1,
                    minZoom: 14,
                    longitude: model.longitude,
                    latitude: model.latitude,
                  };
                  onChange({ [field.key]: defaults[field.key] });
                }}
              >
                Reset
              </button>
            </div>
            <div className="row">
              <input
                className="input"
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) =>
                  onChange({ [field.key]: Number(event.target.value) })
                }
              />
            </div>
            {field.slider ? (
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) =>
                  onChange({ [field.key]: Number(event.target.value) })
                }
              />
            ) : null}
          </label>
        );
      })}

      <label className="row gap">
        <input
          type="checkbox"
          checked={model.visible}
          onChange={(event) => onChange({ visible: event.target.checked })}
        />
        <span>Show custom model</span>
      </label>

      <button type="button" className="btn" onClick={onReset}>
        Reset Transform
      </button>
    </div>
  );
}
