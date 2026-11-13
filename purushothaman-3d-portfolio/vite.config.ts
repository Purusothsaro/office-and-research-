import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // keep Vite/Rollup runtime helpers out of the lazily-loaded 3D chunks
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          if (/node_modules[\/]three[\/]/.test(id)) return 'three';
          if (/node_modules[\/](@react-three|three-stdlib|troika|camera-controls|maath|zustand|its-fine|react-reconciler|suspend-react|@monogrid|three-mesh-bvh|stats|meshline|hls)/.test(id)) return 'r3f';
          if (/node_modules[\/]gsap[\/]/.test(id)) return 'gsap';
          return undefined;
        },
      },
    },
  },
});
