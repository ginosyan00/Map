"use client";

import { useCallback, useMemo, useState } from "react";
import { BuildingEditorPanel } from "@/components/building-editor/BuildingEditorPanel";
import { MapView } from "@/components/map/MapView";
import { GraphicOptionsPanel } from "@/components/map/GraphicOptionsPanel";
import type { CustomLayerStatus } from "@/components/map/CustomBuildingLayer";
import { useCustomBuildings } from "@/hooks/useCustomBuildings";
import { useGraphicOptions } from "@/hooks/useGraphicOptions";
import { useModelLoader } from "@/hooks/useModelLoader";
import { useSelectedBuilding } from "@/hooks/useSelectedBuilding";
import { DEFAULT_APPLY_MODEL_URL } from "@/lib/map/constants";
import { validateConfigExport } from "@/lib/storage/custom-buildings-storage";
import type { MapDebugSnapshot } from "@/types/map";

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
  const [resetF4Tick, setResetF4Tick] = useState(0);

  const pendingModelUrl = modelLoader.source?.url ?? DEFAULT_APPLY_MODEL_URL;

  const headerStatus = useMemo(() => {
    if (mapError) return "error";
    if (!buildings.hydrated) return "loading storage";
    if (selected) return "building selected";
    return "ready";
  }, [mapError, buildings.hydrated, selected]);

  const onUseSample = useCallback(() => {
    modelLoader.setUrl(DEFAULT_APPLY_MODEL_URL, "Sample building (GLB)");
    setPanelError(null);
    if (selected) {
      const model = buildings.applyReplacement(
        selected,
        DEFAULT_APPLY_MODEL_URL,
        0,
        "Sample building (GLB)",
      );
      setFocusTarget({ lng: model.longitude, lat: model.latitude });
      clearSelection();
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
      setPanelError("Նախ սեղմիր քարտեզի վրա մի շենք (կապույտ highlight)։");
      return;
    }
    const url = modelLoader.source?.url;
    if (!url) {
      setPanelError("Նախ upload արա GLB ֆայլ կամ սեղմիր Use sample։");
      return;
    }
    const model = buildings.applyReplacement(
      selected,
      url,
      0,
      modelLoader.source?.label,
    );
    setPanelError(null);
    setFocusTarget({ lng: model.longitude, lat: model.latitude });
    clearSelection();
  }, [selected, modelLoader.source, buildings, clearSelection]);

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

  const onResetF4View = useCallback(() => {
    setResetF4Tick((n) => n + 1);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>OpenMapTiles → Custom GLB POC</h1>
          <p className="muted">
            F4map-like 3D view + building → GLB replace. Graphic options control atmosphere and
            camera feel.
          </p>
        </div>
        <div className={`pill status-${headerStatus.replace(/\s+/g, "-")}`}>{headerStatus}</div>
      </header>

      <div className="workspace">
        <div className="map-column">
          <MapView
            selected={selected}
            replacements={buildings.store.replacements}
            graphicOptions={graphic.options}
            atmosphereInput={graphic.atmosphereInput}
            focusTarget={focusTarget}
            resetF4Tick={resetF4Tick}
            onSelect={selectBuilding}
            onEmptyClick={clearSelection}
            onHideWarning={setHideWarning}
            onMapError={setMapError}
            onLayerStatus={setLayerStatus}
            onDebug={setDebug}
          />
          <GraphicOptionsPanel
            options={graphic.options}
            onChange={graphic.patch}
            onResetF4View={onResetF4View}
          />
        </div>

        <BuildingEditorPanel
          selected={selected}
          activeReplacement={buildings.activeReplacement}
          replacements={buildings.store.replacements}
          modelStatus={modelLoader.state}
          modelError={modelLoader.error}
          modelLabel={modelLoader.source?.label ?? pendingModelUrl}
          hideWarning={hideWarning}
          panelError={panelError ?? mapError ?? buildings.storageError}
          debugOpen={debugOpen}
          debug={debug}
          layerStatus={layerStatus}
          onToggleDebug={() => setDebugOpen((v) => !v)}
          onUseSample={onUseSample}
          onUpload={onUpload}
          onUrl={onUrl}
          onApply={onApply}
          onRemoveCustom={() => {
            if (buildings.activeReplacement) {
              buildings.removeReplacement(buildings.activeReplacement.id);
            }
          }}
          onRestoreOriginal={() => {
            if (buildings.activeReplacement) {
              buildings.restoreOriginal(buildings.activeReplacement.id);
            }
          }}
          onResetTransform={buildings.resetActiveTransform}
          onTransformChange={buildings.updateActiveTransform}
          onSelectReplacement={buildings.selectReplacement}
          onDeleteReplacement={buildings.removeReplacement}
          onToggleReplacementVisible={(id, visible) => {
            const item = buildings.store.replacements.find((r) => r.id === id);
            if (!item) return;
            buildings.upsertReplacement({ ...item, visible });
          }}
          onFocusReplacement={(id) => {
            const item = buildings.store.replacements.find((r) => r.id === id);
            if (!item) return;
            buildings.selectReplacement(id);
            setFocusTarget({ lng: item.longitude, lat: item.latitude });
          }}
          onExport={buildings.exportJson}
          onImportFile={onImportFile}
        />
      </div>
    </div>
  );
}
