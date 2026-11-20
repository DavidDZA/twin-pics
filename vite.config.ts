import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH vaut "/twin-pics/" sur GitHub Pages, "/" en local.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  // onnxruntime-web (modèle des photos similaires) se charge lui-même : ne pas le pré-empaqueter en développement.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
