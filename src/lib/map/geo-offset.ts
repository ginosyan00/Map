/** Approximate meters-per-degree at the equator (longitude scaled by cos(lat)). */
const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_EQ = 111_320;

export type MeterOffset = {
  east: number;
  north: number;
};

export function lngLatOffsetMeters(
  originLng: number,
  originLat: number,
  lng: number,
  lat: number,
): MeterOffset {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  return {
    east: (lng - originLng) * METERS_PER_DEG_LNG_EQ * cosLat,
    north: (lat - originLat) * METERS_PER_DEG_LAT,
  };
}

export function metersOffsetToLngLat(
  originLng: number,
  originLat: number,
  east: number,
  north: number,
): { longitude: number; latitude: number } {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const safeCos = Math.max(1e-6, Math.abs(cosLat));
  return {
    longitude: originLng + east / (METERS_PER_DEG_LNG_EQ * safeCos),
    latitude: originLat + north / METERS_PER_DEG_LAT,
  };
}
