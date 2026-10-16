import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En dev, Vite (5173) relaie Socket.io vers le serveur Node (3001) :
    // le navigateur ne voit qu'une origine, comme en production.
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
