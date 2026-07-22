/**
 * Generates a recognizable multi-storey sample building (GLB).
 * Origin: footprint center at ground (y=0). Units: meters.
 * Run: node scripts/generate-sample-glb.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/models");
const outFile = path.join(outDir, "sample-building.glb");

fs.mkdirSync(outDir, { recursive: true });

/** @type {number[]} */
const positions = [];
/** @type {number[]} */
const normals = [];
/** @type {number[]} */
const colors = [];
/** @type {number[]} */
const indices = [];

function pushVertex(x, y, z, nx, ny, nz, r, g, b) {
  positions.push(x, y, z);
  normals.push(nx, ny, nz);
  colors.push(r, g, b);
}

function addBox(cx, cy, cz, sx, sy, sz, r, g, b) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    // +Z
    [
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [0, 0, 1],
    ],
    // -Z
    [
      [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [0, 0, -1],
    ],
    // +X
    [
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz + hz],
      [1, 0, 0],
    ],
    // -X
    [
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz - hz],
      [-1, 0, 0],
    ],
    // +Y
    [
      [cx - hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [0, 1, 0],
    ],
    // -Y
    [
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz],
      [cx - hx, cy - hy, cz + hz],
      [0, -1, 0],
    ],
  ];

  for (const face of faces) {
    const base = positions.length / 3;
    const n = face[4];
    for (let i = 0; i < 4; i += 1) {
      const p = face[i];
      pushVertex(p[0], p[1], p[2], n[0], n[1], n[2], r, g, b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// Footprint ~18 x 12 m, height ~24 m (8 floors x 3 m)
const width = 18;
const depth = 12;
const floors = 8;
const floorH = 3;
const height = floors * floorH;

// Main body
addBox(0, height / 2, 0, width, height, depth, 0.72, 0.76, 0.8);

// Darker base plinth
addBox(0, 0.4, 0, width + 0.4, 0.8, depth + 0.4, 0.35, 0.38, 0.42);

// Roof slab
addBox(0, height + 0.25, 0, width + 0.6, 0.5, depth + 0.6, 0.45, 0.48, 0.52);

// Roof mechanical box
addBox(2, height + 1.4, -1, 4, 1.8, 3.5, 0.4, 0.42, 0.46);

// Windows on long faces (±Z)
const wallR = 0.15;
const wallG = 0.35;
const wallB = 0.55;
for (let floor = 0; floor < floors; floor += 1) {
  const wy = floor * floorH + 1.35;
  for (let col = -3; col <= 3; col += 1) {
    const wx = col * 2.3;
    // front
    addBox(wx, wy, depth / 2 + 0.06, 1.4, 1.6, 0.12, wallR, wallG, wallB);
    // back
    addBox(wx, wy, -(depth / 2 + 0.06), 1.4, 1.6, 0.12, wallR, wallG, wallB);
  }
  // short faces (±X)
  for (let col = -1; col <= 1; col += 1) {
    const wz = col * 2.8;
    addBox(width / 2 + 0.06, wy, wz, 0.12, 1.6, 1.4, wallR, wallG, wallB);
    addBox(-(width / 2 + 0.06), wy, wz, 0.12, 1.6, 1.4, wallR, wallG, wallB);
  }
}

// Entrance canopy
addBox(0, 3.2, depth / 2 + 1.2, 5, 0.35, 2.4, 0.55, 0.58, 0.62);
addBox(-2.2, 1.6, depth / 2 + 1.2, 0.25, 3.2, 0.25, 0.4, 0.42, 0.45);
addBox(2.2, 1.6, depth / 2 + 1.2, 0.25, 3.2, 0.25, 0.4, 0.42, 0.45);

const positionBytes = Buffer.from(new Float32Array(positions).buffer);
const normalBytes = Buffer.from(new Float32Array(normals).buffer);
const colorBytes = Buffer.from(new Float32Array(colors).buffer);
const indexArray =
  positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
const indexBytes = Buffer.from(indexArray.buffer);
const indexComponentType = positions.length / 3 > 65535 ? 5125 : 5123;

const align4 = (n) => (n + 3) & ~3;
const posOffset = 0;
const normalOffset = align4(positionBytes.length);
const colorOffset = align4(normalOffset + normalBytes.length);
const indexOffset = align4(colorOffset + colorBytes.length);
const binSize = align4(indexOffset + indexBytes.length);

const bin = Buffer.alloc(binSize);
positionBytes.copy(bin, posOffset);
normalBytes.copy(bin, normalOffset);
colorBytes.copy(bin, colorOffset);
indexBytes.copy(bin, indexOffset);

let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (let i = 0; i < positions.length; i += 3) {
  minX = Math.min(minX, positions[i]);
  minY = Math.min(minY, positions[i + 1]);
  minZ = Math.min(minZ, positions[i + 2]);
  maxX = Math.max(maxX, positions[i]);
  maxY = Math.max(maxY, positions[i + 1]);
  maxZ = Math.max(maxZ, positions[i + 2]);
}

const gltf = {
  asset: { version: "2.0", generator: "omt-glb-poc-sample-building" },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ mesh: 0, name: "sample-building" }],
  meshes: [
    {
      name: "OfficeBuilding",
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
          indices: 3,
          material: 0,
        },
      ],
    },
  ],
  materials: [
    {
      name: "VertexColor",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0.05,
        roughnessFactor: 0.7,
      },
      doubleSided: false,
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ],
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
    },
    {
      bufferView: 2,
      componentType: 5126,
      count: colors.length / 3,
      type: "VEC3",
    },
    {
      bufferView: 3,
      componentType: indexComponentType,
      count: indices.length,
      type: "SCALAR",
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: posOffset, byteLength: positionBytes.length, target: 34962 },
    { buffer: 0, byteOffset: normalOffset, byteLength: normalBytes.length, target: 34962 },
    { buffer: 0, byteOffset: colorOffset, byteLength: colorBytes.length, target: 34962 },
    { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.length, target: 34963 },
  ],
  buffers: [{ byteLength: binSize }],
};

const json = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPadding = (4 - (json.length % 4)) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
const binPadding = (4 - (bin.length % 4)) % 4;
const binChunk = Buffer.concat([bin, Buffer.alloc(binPadding)]);

const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

fs.writeFileSync(outFile, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
console.log(`Wrote ${outFile} (${totalLength} bytes)`);
console.log(`Size ≈ ${width}×${depth} m footprint, ${height} m tall, origin at ground center`);
