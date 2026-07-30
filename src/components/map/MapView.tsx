"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { CustomBuildingModel, SelectedBuilding } from "@/types/building";
import type { BuildingLayerInfo, MapDebugSnapshot } from "@/types/map";
import type { GraphicOptions } from "@/hooks/useGraphicOptions";
import { ensureBuildingExtrusionLayer } from "@/lib/map/building-layer";
import {
  applyHiddenBuildings,
  hideTargetsFromReplacements,
  restoreOriginalBuildingFilter,
} from "@/lib/map/building-filter";
import { removeReplacementGeoLayers } from "@/lib/map/replaced-cover";
import {
  applySelfHostedTiles,
  stripBrokenBuildingPromoteId,
  FALLBACK_STYLE_HINT,
  getMapEnvConfig,
} from "@/lib/map/map-style";
import { identityKey } from "@/lib/map/building-identification";
import { CUSTOM_LAYER_ID, SAMPLE_MODEL_URL, isDev } from "@/lib/map/constants";
import { resolveDurableModelUrl } from "@/lib/three/load-glb-model";
import {
  applyAtmosphere,
  type AtmosphereOptions,
} from "@/lib/map/atmosphere";
import { applyBasemapLook } from "@/lib/map/basemap-polish";
import { attachMissingImageFallback } from "@/lib/map/missing-images";
import { applyTerrain } from "@/lib/map/terrain";
import {
  cinematicFlyTo,
  createIdleOrbit,
  resetToDefaultView,
} from "@/lib/map/camera-presets";
import {
  ensureHighlightLayers,
  removeHighlightLayers,
  setHighlightedBuilding,
} from "./BuildingHighlightLayer";
import { attachBuildingSelection } from "./BuildingSelectionLayer";
import {
  ensureCustomBuildingLayer,
  removeCustomBuildingLayer,
  type CustomBuildingLayer,
  type CustomLayerStatus,
} from "./CustomBuildingLayer";
import { MapControls } from "./MapControls";
import { WeatherOverlay } from "./WeatherOverlay";
import {
  attachVehicleTraffic,
  type VehicleTrafficHandle,
} from "./VehicleTrafficLayer";
import {
  attachVegetation,
  type VegetationHandle,
} from "./vegetation/attachVegetation";
import { TreeDebugPanel } from "./vegetation/TreeDebugPanel";

type OrbitHandle = ReturnType<typeof createIdleOrbit>;

type Props = {
  selected: SelectedBuilding | null;
  replacements: CustomBuildingModel[];
  graphicOptions: GraphicOptions;
  atmosphereInput: AtmosphereOptions;
  onSelect: (building: SelectedBuilding) => void;
  onEmptyClick: () => void;
  onHideWarning: (warning: string | null) => void;
  onMapError: (message: string | null) => void;
  onLayerStatus: (status: CustomLayerStatus) => void;
  onDebug: (snapshot: MapDebugSnapshot) => void;
  focusTarget: { lng: number; lat: number } | null;
  /** Bump to trigger cinematic reset to default camera. */
  resetViewTick?: number;
};

export function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const initRef = useRef(false);
  const layerInfoRef = useRef<BuildingLayerInfo | null>(null);
  const customLayerRef = useRef<CustomBuildingLayer | null>(null);
  const selectedRef = useRef<SelectedBuilding | null>(null);
  const replacementsRef = useRef<CustomBuildingModel[]>([]);
  const selectionCacheRef = useRef<Map<string, SelectedBuilding>>(new Map());
  const previousHiddenIdsRef = useRef<Array<string | number>>([]);
  const orbitRef = useRef<OrbitHandle | null>(null);
  const vehiclesRef = useRef<VehicleTrafficHandle | null>(null);
  const vegetationRef = useRef<VegetationHandle | null>(null);
  const propsRef = useRef(props);
  const hideSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHideKeyRef = useRef<string>("");
  const stylePolishedRef = useRef(false);

  const [statusText, setStatusText] = useState("Initializing map…");
  const [hoveringBuilding, setHoveringBuilding] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  propsRef.current = props;
  selectedRef.current = props.selected;
  replacementsRef.current = props.replacements;

  const refreshDebug = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const info = layerInfoRef.current;
    propsRef.current.onDebug({
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      center: [map.getCenter().lng, map.getCenter().lat],
      buildingLayerId: info?.layerId ?? null,
      sourceId: info?.source ?? null,
      sourceLayer: info?.sourceLayer ?? null,
      customLayerStatus: customLayerRef.current?.getStatus().ready
        ? "ready"
        : "not-ready",
      glbLoadingStatus:
        customLayerRef.current?.getStatus().loadingIds.join(",") || "idle",
    });
  }, []);

  const syncHiddenBuildings = useCallback((opts?: { force?: boolean }) => {
    const map = mapRef.current;
    const info = layerInfoRef.current;
    if (!map || !info || !map.isStyleLoaded()) return;

    const replacements = replacementsRef.current;
    if (replacements.length === 0) {
      // Avoid thrashing style when nothing is hidden.
      if (previousHiddenIdsRef.current.length === 0 && lastHideKeyRef.current === "") {
        return;
      }
      restoreOriginalBuildingFilter(map, info, previousHiddenIdsRef.current);
      previousHiddenIdsRef.current = [];
      lastHideKeyRef.current = "";
      propsRef.current.onHideWarning(null);
      return;
    }

    // Stable hide list from saved replacements only — do NOT re-query rendered
    // features on every tile/camera event (that caused buildings to flicker).
    const targets = hideTargetsFromReplacements(replacements).map((target) => {
      const cached = selectionCacheRef.current.get(identityKey(target.identity));
      if (!cached) return target;
      return {
        ...target,
        featureId: target.featureId ?? cached.featureId,
        filterPropertyKey: target.filterPropertyKey ?? cached.filterPropertyKey,
        filterPropertyValue: target.filterPropertyValue ?? cached.filterPropertyValue,
        geometry: target.geometry ?? cached.geometry,
        sourceLayer: target.sourceLayer ?? cached.sourceLayer,
      };
    });

    const hideKey = targets
      .map(
        (t) =>
          `${String(t.featureId ?? "")}:${String(t.filterPropertyKey ?? "")}:${String(t.filterPropertyValue ?? "")}`,
      )
      .sort()
      .join("|");
    if (!opts?.force && hideKey === lastHideKeyRef.current && previousHiddenIdsRef.current.length > 0) {
      // Still re-apply feature-state for newly loaded tiles, but skip filter/paint rewrite.
      const result = applyHiddenBuildings(
        map,
        info,
        targets,
        replacements,
        previousHiddenIdsRef.current,
        { skipExpand: true, skipIfUnchanged: true },
      );
      previousHiddenIdsRef.current = result.hiddenIds;
      return;
    }

    const result = applyHiddenBuildings(
      map,
      info,
      targets,
      replacements,
      previousHiddenIdsRef.current,
      { skipExpand: true },
    );
    previousHiddenIdsRef.current = result.hiddenIds;
    lastHideKeyRef.current = hideKey;
    propsRef.current.onHideWarning(result.warning);
  }, []);

  const scheduleHiddenSync = useCallback(() => {
    if (hideSyncTimerRef.current) clearTimeout(hideSyncTimerRef.current);
    hideSyncTimerRef.current = setTimeout(() => {
      hideSyncTimerRef.current = null;
      // Only needed when we have replacements (feature-state on new tiles).
      if (replacementsRef.current.length === 0) return;
      syncHiddenBuildings();
    }, 250);
  }, [syncHiddenBuildings]);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const env = getMapEnvConfig();
    if (!env.styleUrl) {
      propsRef.current.onMapError(FALLBACK_STYLE_HINT);
      setStatusText("Missing map style URL");
      return;
    }

    const cleanupFns: Array<() => void> = [];
    let cancelled = false;

    const boot = async (): Promise<void> => {
      try {
        let style: StyleSpecification;
        {
          const response = await fetch(env.styleUrl as string);
          if (!response.ok) {
            throw new Error(`Failed to fetch map style (${response.status}).`);
          }
          const json = (await response.json()) as StyleSpecification;
          style = env.tilesUrl
            ? applySelfHostedTiles(json, env.tilesUrl)
            : stripBrokenBuildingPromoteId(json);
        }

        if (!containerRef.current || cancelled) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: env.center,
          zoom: env.zoom,
          pitch: env.pitch,
          bearing: env.bearing,
          maxPitch: 85,
          pitchWithRotate: true,
          dragRotate: true,
          touchPitch: true,
          fadeDuration: 280,
          canvasContextAttributes: { antialias: true },
        });

        // OpenFreeMap sprite gaps (office, atm, gate, …) → silent placeholders.
        cleanupFns.push(attachMissingImageFallback(map));

        // Smoother wheel zoom for pitched 3D navigation.
        map.scrollZoom.setWheelZoomRate(1 / 450);
        map.scrollZoom.setZoomRate(1 / 200);

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
        mapRef.current = map;
        if (isDev()) {
          (window as Window & { __omtMap?: MapLibreMap }).__omtMap = map;
        }

        let detachSelection: (() => void) | undefined;
        let unsubscribeStatus: (() => void) | undefined;
        let onSourceData: ((event: { isSourceLoaded?: boolean; sourceId?: string }) => void) | undefined;

        const onLoad = (): void => {
          if (cancelled) return;
          try {
            map.resize();

            const info = ensureBuildingExtrusionLayer(map);
            layerInfoRef.current = info;
            ensureHighlightLayers(map);

            // Clean architectural basemap (white buildings, dark roads, parks).
            applyBasemapLook(map);
            stylePolishedRef.current = true;
            applyAtmosphere(map, propsRef.current.atmosphereInput);
            applyTerrain(
              map,
              propsRef.current.graphicOptions.groundElevations,
              propsRef.current.graphicOptions.terrainExaggeration,
            );

            const orbit = createIdleOrbit(map);
            orbitRef.current = orbit;
            orbit.setEnabled(propsRef.current.graphicOptions.idleOrbit);
            if (propsRef.current.graphicOptions.idleOrbit) orbit.start();

            const vehicles = attachVehicleTraffic(map);
            vehiclesRef.current = vehicles;
            vehicles.setEnabled(propsRef.current.graphicOptions.showVehicles);

            const vegetation = attachVegetation(map);
            vegetationRef.current = vegetation;
            vegetation.setEnabled(propsRef.current.graphicOptions.showVegetation);

            detachSelection = attachBuildingSelection(map, info, {
              onSelect: (building) => {
                selectionCacheRef.current.set(identityKey(building.identity), building);
                setHighlightedBuilding(map, building);
                propsRef.current.onSelect(building);
                setStatusText(`Selected ${building.identity.type}:${building.identity.value}`);
              },
              onEmptyClick: () => {
                setHighlightedBuilding(map, null);
                propsRef.current.onEmptyClick();
                setStatusText("No building under cursor");
              },
              onHoverChange: setHoveringBuilding,
            });

            setStatusText(`Buildings layer: ${info.layerId}`);
            propsRef.current.onMapError(null);
            setMapReady(true);
            syncHiddenBuildings({ force: true });

            // Debounced: tile loads should NOT thrash building filters every frame.
            onSourceData = (event: { isSourceLoaded?: boolean; sourceId?: string }): void => {
              if (!event.isSourceLoaded) return;
              if (event.sourceId && event.sourceId !== info.source) return;
              scheduleHiddenSync();
            };
            map.on("sourcedata", onSourceData);

            if (replacementsRef.current.length > 0) {
              const custom = ensureCustomBuildingLayer(map);
              customLayerRef.current = custom;
              unsubscribeStatus = custom.subscribe((status) =>
                propsRef.current.onLayerStatus(status),
              );
              custom.setModels(replacementsRef.current);
            }

            requestAnimationFrame(() => map.resize());
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to initialize building layers.";
            propsRef.current.onMapError(message);
            setStatusText(message);
            setMapReady(false);
          }
        };

        map.on("load", onLoad);
        map.on("error", (event) => {
          const message = event.error?.message ?? "Map error (tiles or style failed to load).";
          if (message.includes("could not be loaded") && message.includes("image")) return;
          propsRef.current.onMapError(message);
        });

        const onMoveEnd = (): void => refreshDebug();
        map.on("moveend", onMoveEnd);
        map.on("zoomend", onMoveEnd);

        cleanupFns.push(() => {
          detachSelection?.();
          unsubscribeStatus?.();
          orbitRef.current?.destroy();
          orbitRef.current = null;
          vehiclesRef.current?.destroy();
          vehiclesRef.current = null;
          vegetationRef.current?.destroy();
          vegetationRef.current = null;
          if (hideSyncTimerRef.current) clearTimeout(hideSyncTimerRef.current);
          if (onSourceData) map.off("sourcedata", onSourceData);
          setMapReady(false);
          stylePolishedRef.current = false;
          lastHideKeyRef.current = "";
          if (mapRef.current) {
            removeHighlightLayers(mapRef.current);
            removeReplacementGeoLayers(mapRef.current);
            removeCustomBuildingLayer(mapRef.current);
            mapRef.current.remove();
            mapRef.current = null;
          }
          customLayerRef.current = null;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start map.";
        propsRef.current.onMapError(message);
        setStatusText(message);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
      initRef.current = false;
    };
  }, [refreshDebug, syncHiddenBuildings, scheduleHiddenSync]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    setHighlightedBuilding(map, props.selected);
  }, [props.selected, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (props.replacements.length === 0) {
      if (customLayerRef.current) {
        removeCustomBuildingLayer(map);
        customLayerRef.current = null;
      }
      syncHiddenBuildings({ force: true });
      return;
    }

    const normalized = props.replacements.map((item) => ({
      ...item,
      modelUrl: resolveDurableModelUrl(item.modelUrl || SAMPLE_MODEL_URL),
    }));

    let custom = customLayerRef.current;
    if (!custom) {
      custom = ensureCustomBuildingLayer(map);
      customLayerRef.current = custom;
      custom.subscribe((status) => propsRef.current.onLayerStatus(status));
    }
    custom.setModels(normalized);
    syncHiddenBuildings({ force: true });
    const retry = window.setTimeout(() => syncHiddenBuildings({ force: true }), 450);
    if (map.getLayer(CUSTOM_LAYER_ID)) {
      map.moveLayer(CUSTOM_LAYER_ID);
    }
    setStatusText(`Replacements: ${normalized.length}`);
    return () => window.clearTimeout(retry);
  }, [props.replacements, syncHiddenBuildings, mapReady]);

  useEffect(() => {
    if (!props.focusTarget || !mapRef.current) return;
    cinematicFlyTo(mapRef.current, {
      center: [props.focusTarget.lng, props.focusTarget.lat],
      zoom: Math.max(mapRef.current.getZoom(), 17),
      pitch: Math.max(mapRef.current.getPitch(), 60),
      duration: 2000,
    });
  }, [props.focusTarget]);

  // Apply graphic options when they change — avoid re-polishing the whole basemap every time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    if (!stylePolishedRef.current) {
      applyBasemapLook(map);
      stylePolishedRef.current = true;
    }
    applyAtmosphere(map, props.atmosphereInput);
    applyTerrain(
      map,
      props.graphicOptions.groundElevations,
      props.graphicOptions.terrainExaggeration,
    );
    orbitRef.current?.setEnabled(props.graphicOptions.idleOrbit);
    vehiclesRef.current?.setEnabled(props.graphicOptions.showVehicles);
    vegetationRef.current?.setEnabled(props.graphicOptions.showVegetation);
    if (replacementsRef.current.length > 0) {
      syncHiddenBuildings({ force: true });
    }
  }, [props.atmosphereInput, props.graphicOptions, mapReady, syncHiddenBuildings]);

  useEffect(() => {
    if (!mapReady || !props.resetViewTick) return;
    const map = mapRef.current;
    if (!map) return;
    resetToDefaultView(map);
  }, [props.resetViewTick, mapReady]);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    resetToDefaultView(map);
  }, []);

  return (
    <div className="map-shell">
      <div
        ref={containerRef}
        className="map-canvas"
        style={{ cursor: hoveringBuilding ? "pointer" : "grab" }}
      />
      <WeatherOverlay weather={props.graphicOptions.weather} />
      <MapControls statusText={statusText} onResetView={resetView} />
      {mapReady ? (
        <TreeDebugPanel
          getDebug={() =>
            vegetationRef.current?.getDebug() ?? {
              parkLayer: null,
              parkFeatureId: null,
              parkCount: 0,
              polygonAreaM2: 0,
              requestedDensity: 95,
              generatedTreeCount: 0,
              rejectedPointCount: 0,
              speciesCounts: { deciduous: 0, compact: 0, conifer: 0 },
              currentLod: "hidden",
              currentZoom: 0,
              drawCalls: 0,
              triangleEstimate: 0,
              modelLoading: "idle",
              windEnabled: false,
              shadowsEnabled: false,
              quality: "medium",
              enabled: props.graphicOptions.showVegetation,
            }
          }
          onRegenerate={() => vegetationRef.current?.regenerate()}
          onToggle={(enabled) => {
            vegetationRef.current?.setEnabled(enabled);
          }}
          onDensity={(densityPerHectare) =>
            vegetationRef.current?.setConfigPatch({ densityPerHectare })
          }
        />
      ) : null}
    </div>
  );
}
