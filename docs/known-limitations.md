# Known limitations

- **Vector tile feature IDs may be unstable** across zoom levels and tileset rebuilds.
- **Geometry hashes cannot be used** directly in MapLibre style filters — exclusion requires a property or feature-id expression.
- On **raster-only** basemaps there is no vector building extrusion to remove; this POC targets vector OpenMapTiles schemas.
- **Production-grade replacement** should ship stable `osm_id` or `custom_model_id` (or promote OSM id to feature id at tile build time).
- **One GLB per logical building** inside a single Three.js scene scales to modest counts; hundreds/thousands of unique heavy models need batching, instancing, LODs, or **3D Tiles**.
- OpenFreeMap / public styles may omit `osm_id` on buildings — expect the hide warning and overlapping extrusion+GLB in that case.
- Uploaded `blob:` URLs are not durable across sessions; persist a hosted URL for production.
- Default sample GLB is a simple box, not an architectural asset.
- Terrain draping is best-effort; exaggerated DEM may need manual altitude offsets.
