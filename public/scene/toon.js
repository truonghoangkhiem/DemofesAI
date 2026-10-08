import * as THREE from 'three';

const OUTLINE_COLOR = 0x2b1d1a;
let gradientMap;

// Three-step ramp gives the flat anime shading.
function getGradientMap() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 180, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...extra });
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });

// Inverted-hull outline: a slightly larger back-face copy behind the mesh.
// Works for the centred, roughly convex primitives used here.
export function part(geometry, color, { outline = 0.05, ...extra } = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color, extra));
  if (outline) {
    const shell = new THREE.Mesh(geometry, outlineMaterial);
    shell.scale.setScalar(1 + outline);
    mesh.add(shell);
  }
  return mesh;
}
