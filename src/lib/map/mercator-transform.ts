import { MercatorCoordinate } from "maplibre-gl";
import { Euler, Matrix4 } from "three";
import { degToRad } from "./constants";

export type MercatorTransformInput = {
  longitude: number;
  latitude: number;
  altitude: number;
  /** Degrees */
  rotationX: number;
  /** Degrees */
  rotationY: number;
  /** Degrees */
  rotationZ: number;
  scale: number;
};

/**
 * Build a model matrix where 1 GLB unit ≈ 1 meter in Mercator coordinate space.
 * Rotation inputs are degrees (UI / persistence convention).
 *
 * Y is negated to align MapLibre's mercator axes with a typical Three.js model setup.
 */
export function buildModelMatrix(input: MercatorTransformInput): Matrix4 {
  const mercator = MercatorCoordinate.fromLngLat(
    [input.longitude, input.latitude],
    input.altitude,
  );
  const meter = mercator.meterInMercatorCoordinateUnits();
  const s = meter * input.scale;

  const translate = new Matrix4().makeTranslation(mercator.x, mercator.y, mercator.z ?? 0);
  const scaleMtx = new Matrix4().makeScale(s, -s, s);
  const rotate = new Matrix4().makeRotationFromEuler(
    new Euler(
      degToRad(input.rotationX),
      degToRad(input.rotationY),
      degToRad(input.rotationZ),
      "XYZ",
    ),
  );

  return translate.multiply(scaleMtx).multiply(rotate);
}
