"use client";

import { useState } from "react";
import type { CustomBuildingModel, SelectedBuilding } from "@/types/building";
import type { MapDebugSnapshot } from "@/types/map";
import type { CustomLayerStatus } from "@/components/map/CustomBuildingLayer";
import { SelectedBuildingInfo } from "./SelectedBuildingInfo";
import { ModelUploader } from "./ModelUploader";
import { TransformControls } from "./TransformControls";
import { ManageIntegratePanel } from "./ManageIntegratePanel";
import type { CameraShareState } from "@/lib/integration/share-url";

type Props = {
  selected: SelectedBuilding | null;
  activeReplacement: CustomBuildingModel | null;
  replacements: CustomBuildingModel[];
  modelStatus: "idle" | "loading" | "success" | "error";
  modelError: string | null;
  modelLabel: string | null;
  hideWarning: string | null;
  panelError: string | null;
  debugOpen: boolean;
  debug: MapDebugSnapshot;
  layerStatus: CustomLayerStatus | null;
  onToggleDebug: () => void;
  onUseSample: () => void;
  onUpload: (file: File) => void;
  onUrl: (url: string) => void;
  onApply: () => void;
  onRemoveCustom: () => void;
  onResetTransform: () => void;
  onTransformChange: (patch: Partial<CustomBuildingModel>) => void;
  onSelectReplacement: (id: string) => void;
  onDeleteReplacement: (id: string) => void;
  onToggleReplacementVisible: (id: string, visible: boolean) => void;
  onFocusReplacement: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  camera: CameraShareState | null;
  onClearAll: () => void;
};

export function BuildingEditorPanel(props: Props) {
  const {
    selected,
    activeReplacement,
    replacements,
    hideWarning,
    panelError,
    layerStatus,
  } = props;

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const layerErrors = layerStatus ? Object.values(layerStatus.errors) : [];
  const step = selected ? (props.modelStatus === "success" || activeReplacement ? 3 : 2) : 1;
  const canReplace = Boolean(selected) && props.modelStatus === "success";

  return (
    <aside className="editor">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Replace</p>
          <h2>Building editor</h2>
        </div>
        <button type="button" className="btn tiny ghost" onClick={props.onToggleDebug}>
          {props.debugOpen ? "Debug on" : "Debug"}
        </button>
      </header>

      <ol className="steps" aria-label="Workflow steps">
        <li className={step >= 1 ? "done" : ""} data-active={step === 1 || undefined}>
          Select
        </li>
        <li className={step >= 2 ? "done" : ""} data-active={step === 2 || undefined}>
          Model
        </li>
        <li className={step >= 3 ? "done" : ""} data-active={step === 3 || undefined}>
          Place
        </li>
      </ol>

      {panelError ? <p className="banner error">{panelError}</p> : null}
      {layerErrors.length > 0 ? (
        <p className="banner error">Model load error: {layerErrors[0]}</p>
      ) : null}
      {hideWarning ? <p className="banner warning">{hideWarning}</p> : null}

      <section className="section">
        <div className="section-head">
          <h3>Selected building</h3>
          {selected ? <span className="tag ok">Ready</span> : <span className="tag">Click map</span>}
        </div>
        <SelectedBuildingInfo building={selected} />
        {selected && !selected.canFilterHide ? (
          <p className="banner warning compact">
            No stable id — original building may still show under your model.
          </p>
        ) : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>3D model</h3>
          {props.modelStatus === "success" ? (
            <span className="tag ok">Loaded</span>
          ) : props.modelStatus === "loading" ? (
            <span className="tag warn">Uploading…</span>
          ) : null}
        </div>
        <ModelUploader
          status={props.modelStatus}
          error={props.modelError}
          currentLabel={props.modelLabel}
          onUseSample={props.onUseSample}
          onUpload={props.onUpload}
          onUrlSubmit={props.onUrl}
        />
        <div className="cta-row">
          <button
            type="button"
            className="btn primary wide"
            disabled={!canReplace}
            onClick={props.onApply}
          >
            {selected ? "Replace on map" : "Select a building first"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!activeReplacement}
            onClick={props.onRemoveCustom}
          >
            Remove
          </button>
        </div>
        {activeReplacement ? (
          <p className="ok compact">Replacement active on the map.</p>
        ) : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Adjust</h3>
          {activeReplacement ? <span className="tag">{activeReplacement.modelLabel}</span> : null}
        </div>
        {activeReplacement ? (
          <TransformControls
            model={activeReplacement}
            onChange={props.onTransformChange}
            onReset={props.onResetTransform}
          />
        ) : (
          <p className="muted empty-hint">Replace a building to tweak position, rotation, and scale.</p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Saved</h3>
          <span className="tag">{replacements.length}</span>
        </div>
        {replacements.length === 0 ? (
          <p className="muted empty-hint">No replacements yet.</p>
        ) : (
          <ul className="list">
            {replacements.map((item) => (
              <li key={item.id} className={item.id === activeReplacement?.id ? "active" : ""}>
                <button
                  type="button"
                  className="list-main clickable"
                  onClick={() => props.onFocusReplacement(item.id)}
                >
                  <strong>{item.modelLabel ?? "Custom GLB"}</strong>
                  <span className="muted small">
                    {item.longitude.toFixed(4)}, {item.latitude.toFixed(4)}
                  </span>
                </button>
                <div className="row wrap">
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => props.onSelectReplacement(item.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => props.onToggleReplacementVisible(item.id, !item.visible)}
                  >
                    {item.visible ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="btn tiny danger"
                    onClick={() => props.onDeleteReplacement(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn ghost tiny advanced-toggle"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? "Hide import / export" : "Import / export"}
        </button>
        {advancedOpen ? (
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={props.onExport}>
              Export JSON
            </button>
            <label className="btn">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) props.onImportFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        ) : null}
      </section>

      <ManageIntegratePanel
        camera={props.camera}
        focusId={activeReplacement?.id ?? null}
        replacementCount={replacements.length}
        onClearAll={props.onClearAll}
      />

      {props.debugOpen ? (
        <section className="section">
          <h3>Debug</h3>
          <pre className="debug-pre">
            {JSON.stringify(
              {
                map: props.debug,
                selection: selected
                  ? {
                      identity: selected.identity,
                      featureId: selected.featureId,
                      canFilterHide: selected.canFilterHide,
                    }
                  : null,
                transform: activeReplacement,
                customLayer: props.layerStatus,
                glb: { status: props.modelStatus, error: props.modelError },
              },
              null,
              2,
            )}
          </pre>
        </section>
      ) : null}
    </aside>
  );
}
