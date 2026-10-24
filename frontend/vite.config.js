import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // In production the React SPA is served from Laravel's public/spa/ directory.
    // Setting base to '/spa/' makes all asset references point to /spa/assets/…
    // which PHP's built-in server resolves to public/spa/assets/… correctly.
    // In development (Vite dev server) we keep '/' so the proxy and HMR work normally.
    base: mode === 'production' ? '/spa/' : '/',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
