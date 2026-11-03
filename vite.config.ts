import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], clearScreen: false,
  server: { port: 3006, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } } });
