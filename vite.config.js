import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command }) => ({
  // Phones only expose motion sensors over HTTPS, so the dev server uses a
  // self-signed certificate and listens on the LAN.
  plugins: command === 'serve' ? [basicSsl()] : [],
  server: { host: true },
  preview: { host: true },
  build: {
    rolldownOptions: {
      input: {
        console: page('./index.html'),
        controller: page('./controller/index.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.js'],
  },
}));
