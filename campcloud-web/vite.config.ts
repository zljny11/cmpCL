import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

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
  server: {
    port: 5173,
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
      'dicom-parser',
    ],
    esbuildOptions: {
      plugins: [stubNodeBuiltinsForCodecs],
    },
    noDiscovery: false,
  },
});
