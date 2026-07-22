export type TreeSpeciesId = "deciduous" | "compact" | "conifer";

export type VegetationQualityId = "low" | "medium" | "high";

export type VegetationConfig = {
  enabled: boolean;
  minZoom: number;
  maxZoom: number;
  densityPerHectare: number;
  minSpacingMeters: number;
  edgePaddingMeters: number;
  maxTreesPerFeature: number;
  /** Floor so small parks still look like a grove. */
  minTreesPerFeature: number;
  seed: string;
  configVersion: string;
  groundOffsetMeters: number;
  roadBufferMeters: number;
  buildingBufferMeters: number;
  speciesWeights: Record<TreeSpeciesId, number>;
};

export type VegetationQualityPreset = {
  densityMultiplier: number;
  shadows: boolean;
  wind: boolean;
  lod: "low" | "medium" | "high";
  maxInstances: number;
};

export type ParkFeatureRecord = {
  id: string;
  source: string;
  sourceLayer: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Record<string, unknown>;
  areaM2: number;
  centroid: [number, number];
};

export type TreeInstanceSpec = {
  id: string;
  lng: number;
  lat: number;
  species: TreeSpeciesId;
  rotationY: number;
  scale: number;
  /** Mild canopy tint 0.92–1.08 */
  tint: number;
};

export type VegetationDebugSnapshot = {
  parkLayer: string | null;
  parkFeatureId: string | null;
  parkCount: number;
  polygonAreaM2: number;
  requestedDensity: number;
  generatedTreeCount: number;
  rejectedPointCount: number;
  speciesCounts: Record<TreeSpeciesId, number>;
  currentLod: string;
  currentZoom: number;
  drawCalls: number;
  triangleEstimate: number;
  modelLoading: string;
  windEnabled: boolean;
  shadowsEnabled: boolean;
  quality: VegetationQualityId;
  enabled: boolean;
};

export type VegetationLayoutCacheKey = {
  featureId: string;
  configVersion: string;
  density: number;
  seed: string;
  exclusionVersion: string;
};
