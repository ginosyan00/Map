import {
  Box3,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const CAR_MODEL_URLS = [
  "/models/cars/sedan.glb",
  "/models/cars/sedan-sports.glb",
  "/models/cars/hatchback-sports.glb",
  "/models/cars/suv.glb",
  "/models/cars/suv-luxury.glb",
  "/models/cars/taxi.glb",
  "/models/cars/police.glb",
  "/models/cars/van.glb",
] as const;

/** Kenney length ≈ 2.55 units → stretch to ~4.5 m. */
export const CAR_SCENE_SCALE = 1.75;

const COLORMAP_URL = "/models/cars/Textures/colormap.png";
const gltfLoader = new GLTFLoader();
const textureLoader = new TextureLoader();

let templatesPromise: Promise<Group[]> | null = null;
let templates: Group[] | null = null;
let sharedColormap: Texture | null = null;

export function preloadCarTemplates(): Promise<Group[]> {
  if (templates) return Promise.resolve(templates);
  if (templatesPromise) return templatesPromise;

  templatesPromise = (async () => {
    sharedColormap = await textureLoader.loadAsync(COLORMAP_URL);
    sharedColormap.colorSpace = SRGBColorSpace;
    sharedColormap.flipY = false;
    sharedColormap.wrapS = ClampToEdgeWrapping;
    sharedColormap.wrapT = ClampToEdgeWrapping;
    sharedColormap.needsUpdate = true;

    const loaded: Group[] = [];
    for (const url of CAR_MODEL_URLS) {
      const gltf = await gltfLoader.loadAsync(url);
      loaded.push(normalizeCarTemplate(gltf.scene, url, sharedColormap));
    }
    templates = loaded;
    return loaded;
  })().catch((error) => {
    templatesPromise = null;
    throw error;
  });

  return templatesPromise;
}

export function cloneCarModel(modelIndex: number): Group | null {
  if (!templates || templates.length === 0) return null;
  const template =
    templates[((modelIndex % templates.length) + templates.length) % templates.length]!;
  const clone = template.clone(true);
  clone.scale.setScalar(CAR_SCENE_SCALE);
  clone.visible = true;
  return clone;
}

function normalizeCarTemplate(scene: Object3D, url: string, colormap: Texture): Group {
  const root = new Group();
  root.name = `car:${url}`;
  root.add(scene);

  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const center = box.getCenter(new Vector3());
  // Ground at y=0, centered horizontally. Keep Y-up (Three.js / MapLibre scene meters).
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      mat.map = colormap;
      mat.color = new Color(0xffffff);
      mat.metalness = 0.2;
      mat.roughness = 0.45;
      mat.side = DoubleSide;
      mat.needsUpdate = true;
    }
    mesh.frustumCulled = false;
  });

  root.updateMatrixWorld(true);
  return root;
}
