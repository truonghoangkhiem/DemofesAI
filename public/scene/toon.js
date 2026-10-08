import * as THREE from 'three';

export const OUTLINE_COLOR = 0x2b1d1a;
let gradientMap;

// 4-step ramp gives rich, clean Japanese anime / cel-shading.
export function getGradientMap() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([70, 140, 205, 255]), 4, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    ...extra,
  });
}

const outlineMaterials = new Map();

function getOutlineMaterial(color = OUTLINE_COLOR) {
  if (!outlineMaterials.has(color)) {
    outlineMaterials.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  }
  return outlineMaterials.get(color);
}

// Inverted-hull outline: slightly scaled back-face copy behind the mesh.
export function part(geometry, color, { outline = 0.05, outlineColor = OUTLINE_COLOR, ...extra } = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color, extra));
  if (outline > 0) {
    const shell = new THREE.Mesh(geometry, getOutlineMaterial(outlineColor));
    shell.scale.setScalar(1 + outline);
    mesh.add(shell);
  }
  return mesh;
}
