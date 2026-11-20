import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on your LAN, because phones only allow the mic on HTTPS.
export default defineConfig(({ mode }) => ({
  plugins: [preact(), ...(mode === 'phone' ? [basicSsl()] : [])],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: 'index.html', killTest: 'spikes/kill-test.html' },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
}));
