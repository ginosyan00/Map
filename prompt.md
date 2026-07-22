Դու senior-level GIS, WebGL, Three.js և MapLibre GL JS engineer ես։

Քո խնդիրն է զրոյից ստեղծել առանձին, մաքուր և աշխատող proof-of-concept project, որտեղ օգտագործողը կարող է OpenMapTiles քարտեզի վրա ընտրել կոնկրետ շենք կամ տուն և այդ շենքի սովորական 3D extrusion-ը փոխարինել custom 3D `.glb` մոդելով։

Այս փուլում մի ինտեգրիր լուծումը որևէ գործող մեծ project-ի մեջ։ Ստեղծիր անկախ demo project, որը հետագայում հեշտ կլինի տեղափոխել հիմնական համակարգ։

# 1. Հիմնական նպատակը

Project-ը պետք է ունենա հետևյալ flow-ը.

1. Բացվում է OpenMapTiles vector map։
2. Քարտեզի վրա ցուցադրվում են 3D extruded buildings։
3. Օգտագործողը սեղմում է որևէ շենքի կամ տան վրա։
4. Ընտրված շենքը highlight է լինում։
5. UI-ում ցուցադրվում են ընտրված շենքի հասանելի տվյալները։
6. Օգտագործողը կարող է ընտրել կամ upload անել custom `.glb` 3D model։
7. Ընտրված OpenMapTiles շենքը թաքցվում է միայն տվյալ շենքի համար։
8. Նույն աշխարհագրական դիրքում ցուցադրվում է custom GLB model-ը։
9. Օգտագործողը կարող է կարգավորել model-ի position, rotation, scale և altitude արժեքները։
10. Կարգավորումները պահպանվում են browser local state-ում կամ localStorage-ում, որպեսզի refresh-ից հետո չկորչեն։
11. Օգտագործողը կարող է վերականգնել original building-ը և հեռացնել custom model-ը։

# 2. Պարտադիր տեխնոլոգիաներ

Օգտագործիր հետևյալ stack-ը.

* Next.js latest stable version
* React
* TypeScript strict mode
* MapLibre GL JS
* OpenMapTiles-compatible vector tiles
* Three.js
* Three.js GLTFLoader
* MapLibre `CustomLayerInterface`
* CSS Modules, Tailwind CSS կամ պարզ global CSS
* ESLint
* Prettier

3D model-ի հիմնական format-ը պետք է լինի.

```text
.glb
```

Կարելի է support անել նաև `.gltf`, բայց հիմնական և առաջարկվող format-ը պետք է լինի GLB։

Մի օգտագործիր Mapbox-ի paid կամ proprietary dependency, եթե դա պարտադիր չէ։ Հիմնական renderer-ը պետք է լինի MapLibre GL JS։

# 3. Project structure

Ստեղծիր լավ կազմակերպված architecture։

Առաջարկվող կառուցվածքը.

```text
src/
  app/
    page.tsx
    layout.tsx

  components/
    map/
      MapView.tsx
      BuildingSelectionLayer.ts
      CustomBuildingLayer.ts
      BuildingHighlightLayer.ts
      MapControls.tsx

    building-editor/
      BuildingEditorPanel.tsx
      ModelUploader.tsx
      TransformControls.tsx
      SelectedBuildingInfo.tsx

  hooks/
    useSelectedBuilding.ts
    useCustomBuildings.ts
    useModelLoader.ts

  lib/
    map/
      building-identification.ts
      mercator-transform.ts
      building-filter.ts
      map-style.ts

    three/
      load-glb-model.ts
      dispose-three-object.ts

    storage/
      custom-buildings-storage.ts

  types/
    building.ts
    map.ts

  public/
    models/
      sample-building.glb
```

Կարող ես բարելավել structure-ը, եթե ունես ավելի ճիշտ architecture, բայց մի պահիր ամբողջ logic-ը մեկ component-ի մեջ։

# 4. Environment configuration

Ստեղծիր `.env.example`։

```env
NEXT_PUBLIC_MAP_STYLE_URL=
NEXT_PUBLIC_MAPTILES_URL=
NEXT_PUBLIC_MAP_CENTER_LNG=44.5152
NEXT_PUBLIC_MAP_CENTER_LAT=40.1872
NEXT_PUBLIC_MAP_INITIAL_ZOOM=16
```

Project-ը պետք է աշխատի երկու տարբերակով.

## Տարբերակ A

Օգտագործել պատրաստ OpenMapTiles-compatible style URL։

## Տարբերակ B

Օգտագործել self-hosted OpenMapTiles vector tile endpoint։

README-ում հստակ բացատրիր, թե որտեղ պետք է տեղադրել style URL-ը և tile endpoint-ը։

Մի hardcode արա private token կամ secret։

# 5. Map-ի պահանջները

Map-ը պետք է.

* բացվի ամբողջ viewport-ի կամ application workspace-ի հիմնական հատվածում,
* support անի zoom,
* support անի pitch,
* support անի bearing,
* սկսվի մոտավորապես այս արժեքներով.

```ts
center: [44.5152, 40.1872]
zoom: 16
pitch: 55
bearing: -20
```

Map style-ից գտիր buildings-ի source և source-layer անունները։

OpenMapTiles-ի դեպքում սովորաբար source-layer-ը կարող է լինել.

```text
building
```

Բայց մի ենթադրիր, որ layer ID-ն միշտ նույնն է։

Ստեղծիր utility, որը style-ից գտնում է համապատասխան building extrusion layer-ը կամ ստեղծում է սեփական `fill-extrusion` layer։

3D buildings layer-ը պետք է օգտագործի հնարավոր դաշտերը.

```text
render_height
render_min_height
height
min_height
```

Ավելացրու fallback logic, որպեսզի տարբեր OpenMapTiles schema-ների դեպքում հնարավորինս աշխատի։

# 6. Շենքի ընտրություն

Օգտագործողը պետք է կարողանա սեղմել 3D շենքի վրա։

Օգտագործիր.

```ts
map.queryRenderedFeatures()
```

կամ building layer-ի click event։

Ընտրելուց հետո պահիր.

* `feature.id`
* source
* sourceLayer
* properties
* geometry
* clicked longitude
* clicked latitude
* calculated footprint center
* available building identifier
* available OSM identifier
* building height
* minimum height

Console-ում ամբողջ feature object-ը տպելու փոխարեն ստեղծիր readable debug output։

Ընտրված building-ի համար UI-ում ցուցադրիր.

```text
Feature ID
OSM ID, եթե կա
Name, եթե կա
Building type
Height
Minimum height
Source
Source layer
Center longitude
Center latitude
```

# 7. Շենքի highlight

Ընտրված շենքը պետք է տեսանելիորեն highlight լինի։

Ստեղծիր առանձին highlight layer։

Ընտրված polygon-ը կարող ես տեղադրել ժամանակավոր GeoJSON source-ի մեջ և ցուցադրել որպես.

* fill layer,
* line layer,
* կամ թափանցիկ fill-extrusion։

Highlight-ը պետք է թարմացվի ամեն ընտրության ժամանակ։

Մի փոխիր բոլոր շենքերի styling-ը։ Highlight արա միայն ընտրված feature-ը։

# 8. Շենքի նույնականացում

Սա project-ի ամենակարևոր տեխնիկական մասն է։

Կառուցիր building identification strategy հետևյալ priority-ով.

1. Stable `osm_id` property
2. Stable custom building ID property
3. Vector tile feature ID
4. Source + sourceLayer + feature ID combination
5. Geometry-based fingerprint fallback

Geometry fingerprint-ի համար ստեղծիր deterministic identifier՝ հիմնված polygon coordinates-ի normalized representation-ի վրա։

Օրինակ.

```ts
type BuildingIdentity = {
  type: "osm-id" | "custom-id" | "feature-id" | "geometry-hash";
  value: string;
  source: string;
  sourceLayer?: string;
};
```

Հստակ document արա, որ feature ID-ն տարբեր zoom level-ների կամ tileset rebuild-ի դեպքում կարող է անկայուն լինել։

Մի թաքցրու այդ սահմանափակումը։

# 9. Ընտրված original building-ի թաքցնում

Պետք է թաքցնել միայն ընտրված շենքը, ոչ թե ամբողջ buildings layer-ը։

Նախ փորձիր filter-based approach։

Եթե stable property կա, օգտագործիր filter expression։

Օրինակ.

```ts
[
  "!=",
  ["get", "osm_id"],
  selectedOsmId
]
```

Եթե filter-ն արդեն գոյություն ունի, մի overwrite արա կուրորեն։ Կարդա original filter-ը և ավելացրու exclusion condition։

Օրինակ.

```ts
[
  "all",
  originalFilter,
  ["!=", ["get", "osm_id"], selectedOsmId]
]
```

Եթե property չկա, բայց feature ID-ն հասանելի է, փորձիր `["id"]` expression-ը։

Սակայն project-ում պարտադիր իրականացրու նաև fallback solution։

## Պահանջվող fallback

Եթե selected building-ը հնարավոր չէ վստահելիորեն բացառել original vector layer-ից, ապա.

* ցուցադրիր UI warning,
* պահիր selected polygon-ը,
* custom model-ը միևնույն է թույլ տուր տեղադրել,
* README-ում բացատրիր, որ production-grade replacement-ի համար անհրաժեշտ է stable building ID կամ custom tileset property։

Մի ձևացրու, թե geometry-based filtering-ը MapLibre style filter-ում անվերապահ աշխատում է։

# 10. GLB model-ի բեռնում

Ավելացրու default sample model.

```text
/public/models/sample-building.glb
```

Եթե իրական GLB asset չունես, ստեղծիր placeholder Three.js building geometry կամ տրամադրիր հստակ նշված sample asset integration point։

Project-ը չպետք է կոտրվի sample GLB-ի բացակայության պատճառով։

Օգտագործողը պետք է կարողանա.

* ընտրել default sample model,
* URL-ից բեռնել GLB,
* local computer-ից upload անել `.glb` file։

Local upload-ի դեպքում օգտագործիր.

```ts
URL.createObjectURL(file)
```

և model-ը բեռնելուց կամ հեռացնելուց հետո պարտադիր կանչիր.

```ts
URL.revokeObjectURL()
```

Ստուգիր file extension-ը և file size-ը։

UI-ում ցուցադրիր loading, success և error states։

# 11. Three.js custom layer

Ստեղծիր reusable MapLibre custom 3D layer։

Օգտագործիր.

```ts
type: "custom"
renderingMode: "3d"
```

Layer-ը պետք է.

* օգտագործի նույն WebGL context-ը, ինչ MapLibre-ն,
* բեռնի GLB model-ը `GLTFLoader`-ով,
* ճիշտ հաշվարկի Mercator transform-ը,
* support անի longitude,
* latitude,
* altitude,
* rotationX,
* rotationY,
* rotationZ,
* scale,
* visibility,
* minimum zoom։

Օգտագործիր.

```ts
maplibregl.MercatorCoordinate.fromLngLat()
```

և.

```ts
meterInMercatorCoordinateUnits()
```

Մոդելի scale-ը հաշվարկիր այնպես, որ 1 GLB unit-ը հնարավոր լինի դիտարկել որպես 1 meter։

Կառուցիր type-safe configuration.

```ts
type CustomBuildingModel = {
  id: string;
  buildingIdentity: BuildingIdentity;
  modelUrl: string;

  longitude: number;
  latitude: number;
  altitude: number;

  rotationX: number;
  rotationY: number;
  rotationZ: number;

  scale: number;

  minZoom: number;
  visible: boolean;
};
```

# 12. Position և transform editor

Աջ կամ ձախ sidebar-ում ստեղծիր editor panel։

Պետք է լինեն հետևյալ controls-ը.

## Position

* Longitude
* Latitude
* Altitude

## Rotation

* Rotation X
* Rotation Y
* Rotation Z

Rotation UI-ում օգտագործիր degrees, բայց Three.js-ում convert արա radians։

## Scale

* Uniform scale

## Visibility

* Show/hide custom model
* Minimum zoom

Յուրաքանչյուր control-ի համար ավելացրու.

* numeric input,
* range slider, երբ նպատակահարմար է,
* reset button։

Արժեքների փոփոխությունը պետք է real time ազդի 3D model-ի վրա։

Մի reload արա ամբողջ GLB model-ը rotation կամ scale փոփոխելու ժամանակ։ Update արա transform matrix-ը։

# 13. Automatic initial placement

Custom model-ի initial position-ը ավտոմատ որոշիր selected building-ի geometry-ից։

Հաշվիր polygon centroid կամ լավ կենտրոնական կետ։

Եթե geometry-ն MultiPolygon է, ընտրիր ամենամեծ polygon-ը կամ հաշվիր համապատասխան centroid։

Initial values.

```ts
longitude = building centroid longitude
latitude = building centroid latitude
altitude = 0
rotationX = 90 degrees կամ անհրաժեշտ coordinate conversion
rotationY = 0
rotationZ = 0
scale = 1
```

README-ում բացատրիր, որ GLB model-ի origin-ը ցանկալի է լինի շենքի ներքևի կենտրոնում։

# 14. Model orientation

Blender-ի և MapLibre/Three.js-ի coordinate systems-ի տարբերությունը ճիշտ կարգավորիր։

Ստեղծիր constants կամ utility.

```ts
const DEFAULT_MODEL_ROTATION_X = Math.PI / 2;
```

Մի տարածիր magic numbers ամբողջ codebase-ով։

README-ում ավելացրու Blender export instructions.

```text
Units: Metric
Unit Scale: 1
Apply Rotation
Apply Scale
Origin: building footprint center at ground level
Export: glTF Binary (.glb)
```

# 15. UI design

Ստեղծիր մաքուր developer-tool style UI։

Layout.

```text
┌──────────────────────────────────────────────┐
│ Header / project title / status              │
├─────────────────────────────┬────────────────┤
│                             │                │
│ Map                         │ Editor panel   │
│                             │                │
│                             │                │
└─────────────────────────────┴────────────────┘
```

Sidebar-ում ավելացրու sections.

1. Selected Building
2. Building Identity
3. Original Building Visibility
4. 3D Model
5. Position
6. Rotation
7. Scale
8. Saved Replacements
9. Debug Information

Map-ի վրա ավելացրու փոքր instruction.

```text
Click a building to select it
```

Ընտրված շենքի ժամանակ cursor-ը փոխիր pointer-ի։

Ավելացրու buttons.

```text
Use Sample Model
Upload GLB
Apply Replacement
Reset Transform
Remove Custom Model
Restore Original Building
Export Configuration
```

# 16. Saved replacements

Թույլ տուր մեկից ավելի շենքերի replacement պահել։

Չնայած առաջին use case-ը մեկ շենք է, architecture-ը մի սահմանափակիր միայն մեկ record-ով։

State-ը պետք է լինի նման.

```ts
type CustomBuildingStore = {
  selectedBuildingId: string | null;
  replacements: CustomBuildingModel[];
};
```

Պահպանիր localStorage-ում։

Saved replacements list-ից հնարավոր լինի.

* focus անել շենքի վրա,
* edit անել,
* show/hide անել,
* delete անել,
* restore original building։

# 17. Export և import configuration

Ավելացրու JSON export functionality։

Օրինակ.

```json
{
  "version": 1,
  "replacements": [
    {
      "id": "custom-building-001",
      "buildingIdentity": {
        "type": "osm-id",
        "value": "123456789",
        "source": "openmaptiles",
        "sourceLayer": "building"
      },
      "modelUrl": "/models/sample-building.glb",
      "longitude": 44.5152,
      "latitude": 40.1872,
      "altitude": 0,
      "rotationX": 90,
      "rotationY": 0,
      "rotationZ": 35,
      "scale": 1
    }
  ]
}
```

Նաև ավելացրու configuration import JSON file-ից։

Validate արա imported data-ն մինչև կիրառելը։

# 18. Performance պահանջներ

Կիրառիր հետևյալ optimization-ները.

* GLB model-ը բեռնել միայն անհրաժեշտության դեպքում։
* Model-ը չrender անել `minZoom`-ից ցածր։
* Մի ստեղծիր մեկ animation loop յուրաքանչյուր model-ի համար։
* Օգտագործիր MapLibre repaint flow։
* Three.js geometry, material և texture resources-ը dispose արա model-ը հեռացնելիս։
* Event listener-ները cleanup արա React component unmount-ի ժամանակ։
* Մի initialize արա MapLibre map-ը կրկնակի React Strict Mode-ի պատճառով։
* Մի reload արա map style-ը ամեն state change-ի ժամանակ։
* Մի rebuild արա ամբողջ scene-ը transform change-ի ժամանակ։
* Avoid memory leaks։
* Avoid duplicate custom layers։

# 19. Error handling

Պարտադիր մշակիր հետևյալ դեպքերը.

* Map style URL-ը բացակայում է։
* Vector tiles-ը չեն բեռնվում։
* Building layer-ը չի գտնվել։
* Click-ի տակ building feature չկա։
* Selected feature-ը չունի stable ID։
* GLB file-ը invalid է։
* GLB file-ը չափազանց մեծ է։
* Texture-ը չի բեռնվում։
* Model-ը scene-ում չի երևում։
* Model-ը terrain-ի տակ է։
* Custom layer-ն արդեն գոյություն ունի։
* Original building-ը հնարավոր չէ filter-ով թաքցնել։
* localStorage data-ն invalid է։
* WebGL context-ը կորել է։

UI-ում ցուցադրիր հասկանալի error message, ոչ միայն `console.error`։

# 20. Debug mode

Ավելացրու debug panel, որը կարելի է բացել կամ փակել։

Այն պետք է ցուցադրի.

* current zoom,
* pitch,
* bearing,
* center,
* selected feature properties,
* selected feature ID,
* detected building layer ID,
* source ID,
* source-layer,
* generated BuildingIdentity,
* custom layer status,
* GLB loading status,
* current transform values։

Ավելացրու development-only console logs, բայց production build-ում խուսափիր անիմաստ logging-ից։

# 21. Terrain support

Հիմնական MVP-ն կարող է աշխատել առանց terrain-ի։

Սակայն architecture-ում պատրաստիր optional terrain support։

Եթե terrain-ը ակտիվ է, փորձիր օգտագործել.

```ts
map.queryTerrainElevation([longitude, latitude])
```

և model-ի initial altitude-ը համապատասխանեցնել terrain elevation-ին։

Եթե terrain source չկա, fallback արա `0`։

# 22. Առաջնահերթ implementation plan

Աշխատանքը կատարիր փուլերով։

## Phase 1

* Initialize Next.js project
* Install dependencies
* Render OpenMapTiles map
* Add 3D building extrusion layer

## Phase 2

* Detect building layer
* Select building by click
* Highlight selected polygon
* Show properties panel

## Phase 3

* Add Three.js custom layer
* Load sample GLB
* Position model on selected building centroid

## Phase 4

* Hide only selected original building
* Implement stable identity and fallback identity
* Add warning when exact exclusion is impossible

## Phase 5

* Add transform editor
* Add local GLB upload
* Add model URL input
* Add real-time updates

## Phase 6

* Save replacements
* Export/import JSON
* Restore original building
* Resource cleanup

## Phase 7

* Test
* Fix TypeScript errors
* Fix lint errors
* Write documentation

# 23. Testing

Պարտադիր ստուգիր առնվազն հետևյալ scenarios-ը.

1. Map-ը բացվում է։
2. 3D buildings-ը երևում են։
3. Շենքի վրա click-ը ընտրում է ճիշտ feature-ը։
4. Դատարկ տարածքի click-ը չի կոտրում state-ը։
5. Selected building-ը highlight է լինում։
6. Sample GLB model-ը բեռնվում է։
7. Model-ը հայտնվում է selected building-ի մոտ։
8. Rotation-ը փոխվում է առանց model reload-ի։
9. Scale-ը փոխվում է առանց model reload-ի։
10. Altitude-ը աշխատում է։
11. Original building exclusion-ը աշխատում է stable ID-ի դեպքում։
12. Warning-ը ցուցադրվում է stable ID-ի բացակայության դեպքում։
13. Refresh-ից հետո config-ը վերականգնվում է։
14. Custom model-ը հեռացնելիս Three.js resources-ը dispose են լինում։
15. Restore button-ը վերադարձնում է original building-ը։
16. Multiple saved replacements-ը չեն կոտրում քարտեզը։
17. Production build-ը հաջող է ավարտվում։

Գործարկիր.

```bash
npm run lint
npm run typecheck
npm run build
```

Եթե `typecheck` script չկա, ավելացրու այն։

# 24. README

Ստեղծիր մանրամասն `README.md`, որտեղ բացատրված կլինի.

* ինչ է անում project-ը,
* architecture-ը,
* ինչպես տեղադրել dependencies-ը,
* ինչպես լրացնել `.env.local`,
* ինչպես միացնել OpenMapTiles style URL-ը,
* ինչպես միացնել self-hosted tile server-ը,
* ինչպես ընտրել շենքը,
* ինչպես upload անել GLB,
* ինչպես պատրաստել GLB Blender-ում,
* ինչպես է original building-ը թաքցվում,
* ինչու է stable building ID-ն կարևոր,
* ինչ սահմանափակումներ կան feature ID-ի դեպքում,
* ինչպես ավելացնել custom `osm_id` կամ `custom_model_id` tileset-ում,
* ինչպես build անել production version-ը։

README-ում ավելացրու նաև troubleshooting section։

# 25. Technical report

Ստեղծիր.

```text
docs/
  architecture.md
  building-identification.md
  custom-3d-layer.md
  known-limitations.md
```

`known-limitations.md` ֆայլում ազնվորեն գրիր.

* vector tile feature ID-ն կարող է անկայուն լինել,
* geometry hash-ը չի կարող ուղղակի օգտագործվել MapLibre style filter-ում,
* raster map-ի դեպքում original building-ը հնարավոր չէ իրականում հեռացնել,
* production-grade replacement-ի համար ցանկալի է stable `osm_id` կամ custom property,
* մեծ թվով models-ի համար մեկ model մեկ layer architecture-ը scalable չէ,
* մեծ datasets-ի համար պետք է դիտարկել batching, single Three.js scene կամ 3D Tiles։

# 26. Code quality

* Օգտագործիր TypeScript strict typing։
* Մի օգտագործիր `any`, եթե բացարձակ անհրաժեշտ չէ։
* Եթե ստիպված ես օգտագործել `any`, գրիր պատճառը comment-ում։
* Մի կրկնօրինակիր logic-ը։
* Գրիր reusable functions։
* Ավելացրու cleanup functions։
* Մի ստեղծիր չափազանց մեծ components։
* Մի թող TODO-ներ առանց բացատրության։
* Մի գրիր կեղծ implementation։
* Մի գրիր միայն UI mockup։
* Project-ը պետք է իրականում compile և run լինի։

# 27. Կարևոր սահմանափակումներ

Մի արա հետևյալ սխալները.

* Մի թաքցրու ամբողջ building layer-ը։
* Մի փոխարինիր բոլոր շենքերը։
* Մի օգտագործիր միայն marker կամ static image։
* Մի ձևացրու, թե GLB-ն OpenMapTiles source-ի մաս է։
* Մի օգտագործիր raster screenshot որպես map։
* Մի դիր custom model-ը պատահական coordinate-ում։
* Մի ignore արա Blender origin-ը և real-world scale-ը։
* Մի reload արա ամբողջ map-ը model transform-ի ժամանակ։
* Մի թող WebGL resources-ը memory-ում model-ը հեռացնելուց հետո։
* Մի համարիր click coordinate-ը շենքի կենտրոն առանց geometry centroid հաշվարկելու։
* Մի պնդիր, որ building-ը հաջողությամբ թաքցվել է, եթե stable ID չկա և filter-ը չի աշխատում։

# 28. Վերջնական արդյունք

Աշխատանքի վերջում տրամադրիր.

1. Ամբողջական աշխատող project։
2. File tree։
3. Setup commands։
4. `.env.example`։
5. Sample GLB integration։
6. Building selection functionality։
7. Building highlight functionality։
8. Original building exclusion logic։
9. Custom Three.js GLB layer։
10. Transform editor։
11. Saved replacements։
12. JSON export/import։
13. README։
14. Architecture documentation։
15. Known limitations։
16. Testing report։
17. `npm run build` արդյունքը։

Վերջում գրիր հստակ report այս ձևաչափով.

```text
## Implemented
- ...

## Architecture
- ...

## Building selection strategy
- ...

## Original building hiding strategy
- ...

## GLB rendering strategy
- ...

## Files created
- ...

## Tests completed
- ...

## Known limitations
- ...

## How to run
- ...

## Next production steps
- ...
```

Սկսիր project-ի և dependency-ների audit-ից, հետո ներկայացրու կարճ implementation plan և անմիջապես անցիր իրականացմանը։

Մի կանգ առ միայն analysis կամ recommendation փուլում։ Ստեղծիր աշխատող codebase, գործարկիր ստուգումները և ուղղիր հայտնաբերված խնդիրները։
