import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Emscripten-generated codec bundles unconditionally reference Node builtins
// (`require("fs")`, `require("path")`) inside dead `ENVIRONMENT_IS_NODE`
// branches. esbuild's static scan fails on this and refuses to pre-bundle them
// for the browser, which leaves dicom-image-loader's
// `import factory from '@cornerstonejs/codec-*/decodewasmjs'` resolving to a
// raw CJS file with no ESM default export. Stub the builtins out during dep
// optimization so esbuild can finish CJS→ESM conversion.
const stubNodeBuiltinsForCodecs = {
  name: 'cs-codec-stub-node-builtins',
  setup(build: any) {
    build.onResolve({ filter: /^(fs|path)$/ }, (args: any) => {
      if (args.importer && args.importer.includes('@cornerstonejs/codec-')) {
        return { path: args.path, namespace: 'cs-codec-stub' };
      }
      return null;
    });
    build.onLoad({ filter: /.*/, namespace: 'cs-codec-stub' }, () => ({
      contents:
        'export default {};\n' +
        'export const readFileSync = () => { throw new Error("fs not in browser"); };\n' +
        'export const dirname = () => "";\n' +
        'export const normalize = (p) => p;\n',
      loader: 'js',
    }));
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      src: resolve(__dirname, 'src'),
      '@redux': resolve(__dirname, 'src/redux'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  optimizeDeps: {
    entries: [
      'src/index.tsx',
      'src/components/Viewer/**/*.{ts,tsx,js}',
    ],
    exclude: [
      '@cornerstonejs/core',
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/tools',
      '@cornerstonejs/calculate-suv',
    ],
    include: [
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
      'dicom-parser',
      'globalthis',
    ],
    esbuildOptions: {
      plugins: [stubNodeBuiltinsForCodecs],
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
