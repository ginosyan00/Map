"use client";

import type { CustomBuildingModel, SelectedBuilding } from "@/types/building";
import type { MapDebugSnapshot } from "@/types/map";
import type { CustomLayerStatus } from "@/components/map/CustomBuildingLayer";
import { SelectedBuildingInfo } from "./SelectedBuildingInfo";
import { ModelUploader } from "./ModelUploader";
import { TransformControls } from "./TransformControls";
import { identityKey } from "@/lib/map/building-identification";

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

  const layerErrors = layerStatus ? Object.values(layerStatus.errors) : [];

  return (
    <aside className="editor">
      <header className="editor-header">
        <h2>Building editor</h2>
        <button type="button" className="btn tiny ghost" onClick={props.onToggleDebug}>
          {props.debugOpen ? "Hide debug" : "Show debug"}
        </button>
      </header>

      <p className="muted small">
        1) Select a building on the map → 2) Choose or upload a GLB → 3) Replace
      </p>

      {panelError ? <p className="error">{panelError}</p> : null}
      {layerErrors.length > 0 ? (
        <p className="error">Model load error: {layerErrors[0]}</p>
      ) : null}

      <section className="section">
        <h3>1. Selected Building</h3>
        <SelectedBuildingInfo building={selected} />
        {selected && !selected.canFilterHide ? (
          <p className="warning">
            This building has no stable filter id. The original extrusion may still show under
            your GLB (double-draw). Prefer tiles with <code>osm_id</code>.
          </p>
        ) : null}
      </section>

      <section className="section">
        <h3>2. Building Identity</h3>
        {selected ? (
          <dl className="info-grid">
            <div className="info-row">
              <dt>Type</dt>
              <dd>{selected.identity.type}</dd>
            </div>
            <div className="info-row">
              <dt>Value</dt>
              <dd title={selected.identity.value}>{selected.identity.value}</dd>
            </div>
            <div className="info-row">
              <dt>Key</dt>
              <dd title={identityKey(selected.identity)}>
                {identityKey(selected.identity)}
              </dd>
            </div>
            <div className="info-row">
              <dt>Filter strategy</dt>
              <dd>{selected.filterStrategy}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">No selection — click a building on the map.</p>
        )}
        <p className="muted small warn-text">
          Feature IDs may change across zoom levels or tileset rebuilds. Prefer stable{" "}
          <code>osm_id</code> / custom properties for production.
        </p>
      </section>

      <section className="section">
        <h3>3. Original Building Visibility</h3>
        {hideWarning ? <p className="warning">{hideWarning}</p> : null}
        {activeReplacement ? (
          <p className="ok">
            Replacement active — original extrusion hidden; your GLB is drawn on the map.
          </p>
        ) : (
          <p className="muted">
            Select a building, prepare a model below, then press <strong>Replace selected building</strong>.
          </p>
        )}
      </section>

      <section className="section">
        <h3>4. 3D Model</h3>
        <ModelUploader
          status={props.modelStatus}
          error={props.modelError}
          currentLabel={props.modelLabel}
          onUseSample={props.onUseSample}
          onUpload={props.onUpload}
          onUrlSubmit={props.onUrl}
        />
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button type="button" className="btn primary" disabled={!selected} onClick={props.onApply}>
            Replace selected building
          </button>
          <button
            type="button"
            className="btn"
            disabled={!activeReplacement}
            onClick={props.onRemoveCustom}
          >
            Remove replacement
          </button>
        </div>
      </section>

      <section className="section">
        <h3>5–7. Position / Rotation / Scale</h3>
        {activeReplacement ? (
          <TransformControls
            model={activeReplacement}
            onChange={props.onTransformChange}
            onReset={props.onResetTransform}
          />
        ) : (
          <p className="muted">Apply a replacement to edit transforms.</p>
        )}
      </section>

      <section className="section">
        <h3>8. Saved Replacements</h3>
        {replacements.length === 0 ? (
          <p className="muted">No saved replacements yet.</p>
        ) : (
          <ul className="list">
            {replacements.map((item) => (
              <li key={item.id} className={item.id === activeReplacement?.id ? "active" : ""}>
                <div className="list-main">
                  <strong>{item.modelLabel ?? item.id}</strong>
                  <span className="muted small">
                    {item.longitude.toFixed(5)}, {item.latitude.toFixed(5)}
                  </span>
                </div>
                <div className="row wrap">
                  <button type="button" className="btn tiny" onClick={() => props.onFocusReplacement(item.id)}>
                    Focus
                  </button>
                  <button type="button" className="btn tiny" onClick={() => props.onSelectReplacement(item.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => props.onToggleReplacementVisible(item.id, !item.visible)}
                  >
                    {item.visible ? "Hide" : "Show"}
                  </button>
                  <button type="button" className="btn tiny danger" onClick={() => props.onDeleteReplacement(item.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={props.onExport}>
            Export Configuration
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
      </section>

      {props.debugOpen ? (
        <section className="section">
          <h3>9. Debug Information</h3>
          <pre className="debug-pre">{JSON.stringify(
            {
              map: props.debug,
              selection: selected
                ? {
                    identity: selected.identity,
                    featureId: selected.featureId,
                    properties: selected.properties,
                    canFilterHide: selected.canFilterHide,
                  }
                : null,
              transform: activeReplacement,
              customLayer: props.layerStatus,
              glb: { status: props.modelStatus, error: props.modelError },
            },
            null,
            2,
          )}</pre>
        </section>
      ) : null}
    </aside>
  );
}
