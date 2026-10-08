import * as THREE from 'three';

export const OUTLINE_COLOR = 0x2a1a2e;
let gradientMap;

// Shared rim-light uniforms: the scene tints every toon material's rim at once (mood lighting).
export const rimUniforms = {
  rimColor: { value: new THREE.Color(0xffc9a0) },
  rimStrength: { value: 0.55 },
};

// 3-step ramp with a soft shadow band: crisp anime cel-shading that still reads in shadow.
export function getGradientMap() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

// Adds a stepped Fresnel rim (the bright edge light of anime game characters).
function addRim(material, strength) {
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = rimUniforms.rimColor;
    shader.uniforms.rimStrength = rimUniforms.rimStrength;
    shader.uniforms.rimLocal = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimLocal;')
      .replace(
        '#include <opaque_fragment>',
        `float rimDot = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        float rim = smoothstep(0.62, 0.78, rimDot) * smoothstep(-0.2, 0.6, normal.y + 0.35);
        outgoingLight += rimColor * rim * rimStrength * rimLocal;
        #include <opaque_fragment>`,
      );
  };
  // The strength is a uniform, so every rim material can share one program.
  material.customProgramCacheKey = () => 'rim-toon';
}

export function toon(color, { rim = 1, ...extra } = {}) {
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    ...extra,
  });
  if (rim > 0) addRim(material, rim);
  return material;
}

const outlineMaterials = new Map();

function getOutlineMaterial(color = OUTLINE_COLOR) {
  if (!outlineMaterials.has(color)) {
    outlineMaterials.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  }
  return outlineMaterials.get(color);
}

// Inverted-hull outline: slightly scaled back-face copy behind the mesh.
export function part(geometry, color, { outline = 0.05, outlineColor = OUTLINE_COLOR, shadow = true, ...extra } = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color, extra));
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  if (outline > 0) {
    const shell = new THREE.Mesh(geometry, getOutlineMaterial(outlineColor));
    shell.scale.setScalar(1 + outline);
    mesh.add(shell);
  }
  return mesh;
}

// Canvas helper for textures drawn in code.
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return Object.assign(texture, { canvas, ctx });
}

// Soft round glow sprite texture, used for orbs, sun halo and sparkles.
let glowTexture;
export function getGlowTexture() {
  glowTexture ??= canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  return glowTexture;
}

// Tiny deterministic PRNG so the world layout is the same on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
