// Post-processing stack: bloom for the glowing bits, then a warm anime grade + vignette.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.42 },
    uSaturation: { value: 1.12 },
    uTint: { value: new THREE.Color(1.02, 0.98, 1.0) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.85, 0.5) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uFlash;
    uniform vec3 uTint, uFlashColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation) * uTint;
      vec2 p = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(p * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      // Violet shadows / warm highlights split-tone.
      c.rgb += vec3(0.035, 0.0, 0.06) * (1.0 - smoothstep(0.0, 0.35, l));
      c.rgb += uFlashColor * uFlash;
      gl_FragColor = c;
    }`,
};

export function createEffects(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 1.6);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    flash(amount = 0.6) {
      grade.uniforms.uFlash.value = Math.max(grade.uniforms.uFlash.value, amount);
    },
    update(dt) {
      const u = grade.uniforms.uFlash;
      u.value = Math.max(0, u.value - dt * 1.8);
    },
    render() {
      composer.render();
    },
  };
}
