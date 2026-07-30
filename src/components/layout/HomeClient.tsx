"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BuildingEditorPanel } from "@/components/building-editor/BuildingEditorPanel";
import { MapView } from "@/components/map/MapView";
import { GraphicOptionsPanel } from "@/components/map/GraphicOptionsPanel";
import type { CustomLayerStatus } from "@/components/map/CustomBuildingLayer";
import { useAppShareState } from "@/hooks/useAppShareState";
import { useCustomBuildings } from "@/hooks/useCustomBuildings";
import { useEditorHotkeys } from "@/hooks/useEditorHotkeys";
import { useGraphicOptions } from "@/hooks/useGraphicOptions";
import { useModelLoader } from "@/hooks/useModelLoader";
import { useSelectedBuilding } from "@/hooks/useSelectedBuilding";
import { DEFAULT_APPLY_MODEL_URL } from "@/lib/map/constants";
import { identityKey } from "@/lib/map/building-identification";
import { validateConfigExport } from "@/lib/storage/custom-buildings-storage";
import type { MapDebugSnapshot } from "@/types/map";
import type { SelectedBuilding } from "@/types/building";

const EMPTY_DEBUG: MapDebugSnapshot = {
  zoom: 0,
  pitch: 0,
  bearing: 0,
  center: [0, 0],
  buildingLayerId: null,
  sourceId: null,
  sourceLayer: null,
  customLayerStatus: "not-ready",
  glbLoadingStatus: "idle",
};

export function HomeClient() {
  const share = useAppShareState();
  const { selected, selectBuilding, clearSelection } = useSelectedBuilding();
  const buildings = useCustomBuildings();
  const modelLoader = useModelLoader();
  const graphic = useGraphicOptions();

  const [mapError, setMapError] = useState<string | null>(null);
  const [hideWarning, setHideWarning] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState<MapDebugSnapshot>(EMPTY_DEBUG);
  const [layerStatus, setLayerStatus] = useState<CustomLayerStatus | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ lng: number; lat: number } | null>(null);
  const [resetViewTick, setResetViewTick] = useState(0);
  const [focusApplied, setFocusApplied] = useState(false);

  const pendingModelUrl = modelLoader.source?.url ?? DEFAULT_APPLY_MODEL_URL;
  const embed = share.embed;

  const headerStatus = useMemo(() => {
    if (mapError) return "error";
    if (!buildings.hydrated) return "loading storage";
    if (selected) return "building selected";
    return "ready";
  }, [mapError, buildings.hydrated, selected]);

  const camera = useMemo(
    () =>
      debug.center[0] !== 0 || debug.center[1] !== 0
        ? {
            lng: debug.center[0],
            lat: debug.center[1],
            zoom: debug.zoom,
            pitch: debug.pitch,
            bearing: debug.bearing,
          }
        : share.camera,
    [debug, share.camera],
  );

  useEffect(() => {
    if (!buildings.hydrated || focusApplied || !share.focusId) return;
    const item = buildings.draftReplacements.find((r) => r.id === share.focusId);
    if (!item) {
      setFocusApplied(true);
      return;
    }
    buildings.selectReplacement(item.id);
    setFocusTarget({ lng: item.longitude, lat: item.latitude });
    setFocusApplied(true);
  }, [buildings, share.focusId, focusApplied]);

  const onMapSelect = useCallback(
    (building: SelectedBuilding) => {
      selectBuilding(building);
      const match = buildings.draftReplacements.find(
        (r) => identityKey(r.buildingIdentity) === identityKey(building.identity),
      );
      buildings.selectReplacement(match?.id ?? null);
      setPanelError(null);
    },
    [selectBuilding, buildings],
  );

  const onEmptyClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const onUseSample = useCallback(() => {
    modelLoader.setUrl(DEFAULT_APPLY_MODEL_URL, "Sample building (GLB)");
    setPanelError(null);
    if (selected) {
      try {
        const model = buildings.applyReplacement(
          selected,
          DEFAULT_APPLY_MODEL_URL,
          0,
          "Sample building (GLB)",
        );
        setFocusTarget({ lng: model.longitude, lat: model.latitude });
        clearSelection();
      } catch (error) {
        setPanelError(error instanceof Error ? error.message : "Failed to apply sample model.");
      }
    }
  }, [modelLoader, selected, buildings, clearSelection]);

  const onUpload = useCallback(
    (file: File) => {
      modelLoader.uploadFile(file);
      setPanelError(null);
    },
    [modelLoader],
  );

  const onUrl = useCallback(
    (url: string) => {
      modelLoader.setUrl(url);
      setPanelError(null);
    },
    [modelLoader],
  );

  const onApply = useCallback(() => {
    if (!selected) {
      setPanelError("Select a building on the map first (blue highlight).");
      return;
    }
    if (modelLoader.state === "loading") {
      setPanelError("Model is still uploading. Wait until status is success.");
      return;
    }
    const url = modelLoader.source?.url;
    if (!url) {
      setPanelError("Upload a GLB file or press Use Sample Model first.");
      return;
    }
    try {
      const model = buildings.applyReplacement(
        selected,
        url,
        0,
        modelLoader.source?.label,
      );
      setPanelError(null);
      setFocusTarget({ lng: model.longitude, lat: model.latitude });
      clearSelection();
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : "Failed to apply replacement.");
    }
  }, [selected, modelLoader.state, modelLoader.source, buildings, clearSelection]);

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const json: unknown = JSON.parse(text);
        validateConfigExport(json);
        buildings.importJson(json);
        setPanelError(null);
      } catch (error) {
        setPanelError(
          error instanceof Error ? error.message : "Failed to import configuration JSON.",
        );
      }
    },
    [buildings],
  );

  const onResetDefaultView = useCallback(() => {
    setResetViewTick((n) => n + 1);
  }, []);

  const onRemoveActive = useCallback(() => {
    if (buildings.activeReplacement) {
      buildings.markDeleteReplacement(buildings.activeReplacement.id);
    }
  }, [buildings]);

  useEditorHotkeys({
    enabled: !embed,
    onReplace: onApply,
    onClearSelection: clearSelection,
    onRemoveActive,
  });

  return (
    <div className={`app ${embed ? "embed" : ""}`}>
      {!embed ? (
        <header className="app-header">
          <div>
            <p className="brand">Manvel Map</p>
            <h1>Building replacer</h1>
            <p className="muted">
              Click a building, pick a GLB, replace it. Share or embed via Manage &amp; integrate.
            </p>
          </div>
          <div className={`pill status-${headerStatus.replace(/\s+/g, "-")}`}>{headerStatus}</div>
        </header>
      ) : null}

      <div className="workspace">
        <div className="map-column">
          <MapView
            selected={selected}
            replacements={buildings.store.replacements}
            graphicOptions={graphic.options}
            atmosphereInput={graphic.atmosphereInput}
            focusTarget={focusTarget}
            resetViewTick={resetViewTick}
            initialCamera={share.camera}
            onSelect={onMapSelect}
            onEmptyClick={onEmptyClick}
            onHideWarning={setHideWarning}
            onMapError={setMapError}
            onLayerStatus={setLayerStatus}
            onDebug={setDebug}
          />
          {!embed ? (
            <GraphicOptionsPanel
              options={graphic.options}
              onChange={graphic.patch}
              onResetView={onResetDefaultView}
            />
          ) : null}
        </div>

        {!embed ? (
          <BuildingEditorPanel
            selected={selected}
            activeReplacement={buildings.activeReplacement}
            replacements={buildings.draftReplacements}
            modelStatus={modelLoader.state}
            modelError={modelLoader.error}
            modelLabel={modelLoader.source?.label ?? pendingModelUrl}
            hideWarning={hideWarning}
            panelError={panelError ?? mapError ?? buildings.storageError}
            debugOpen={debugOpen}
            debug={debug}
            layerStatus={layerStatus}
            camera={camera}
            pendingDeleteIds={buildings.pendingDeleteIds}
            isDirty={buildings.isDirty}
            saving={buildings.saving}
            onToggleDebug={() => setDebugOpen((v) => !v)}
            onUseSample={onUseSample}
            onUpload={onUpload}
            onUrl={onUrl}
            onApply={onApply}
            onRemoveCustom={onRemoveActive}
            onResetTransform={buildings.resetActiveTransform}
            onTransformChange={buildings.updateActiveTransform}
            onSelectReplacement={buildings.selectReplacement}
            onDeleteReplacement={buildings.markDeleteReplacement}
            onUndeleteReplacement={buildings.unmarkDeleteReplacement}
            onToggleReplacementVisible={(id, visible) => {
              buildings.patchReplacement(id, { visible });
            }}
            onFocusReplacement={(id) => {
              const item = buildings.draftReplacements.find((r) => r.id === id);
              if (!item || buildings.pendingDeleteIds.includes(id)) return;
              buildings.selectReplacement(id);
              setFocusTarget({ lng: item.longitude, lat: item.latitude });
            }}
            onExport={buildings.exportJson}
            onImportFile={onImportFile}
            onClearAll={buildings.clearAllReplacements}
            onSaveDraft={() => {
              void buildings.saveDraft().catch(() => {
                /* storageError already set */
              });
            }}
            onDiscardDraft={buildings.discardDraft}
          />
        ) : null}
      </div>
    </div>
  );
}
