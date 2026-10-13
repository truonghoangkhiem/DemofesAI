// Copies the browser libraries the page imports (see the importmap in public/index.html) from
// node_modules into public/vendor/. Vercel serves only public/ statically (express.static is ignored
// there), so this runs as the Vercel build step. Locally lib/app.js serves the same paths directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = name => path.join(root, 'node_modules', name);

const three = pkgDir('three');
const FILES = {
  'three/build/three.module.js': path.join(three, 'build/three.module.js'),
  'three/build/three.core.js': path.join(three, 'build/three.core.js'),
  'marked/marked.esm.js': path.join(pkgDir('marked'), 'lib/marked.esm.js'),
  'dompurify/purify.es.mjs': path.join(pkgDir('dompurify'), 'dist/purify.es.mjs'),
};
for (const file of [
  'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/UnrealBloomPass.js',
  'postprocessing/ShaderPass.js', 'postprocessing/OutputPass.js', 'postprocessing/Pass.js',
  'postprocessing/MaskPass.js', 'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
]) FILES[`three/addons/${file}`] = path.join(three, 'examples/jsm', file);

for (const [target, source] of Object.entries(FILES)) {
  const dest = path.join(root, 'public/vendor', target);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
}
console.log(`Copied ${Object.keys(FILES).length} vendor files to public/vendor/`);
