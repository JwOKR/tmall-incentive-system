import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

function getGitHash(): string {
  try {
    return process.env.VITE_GIT_HASH || execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

function getBuildTime(): string {
  return process.env.VITE_BUILD_TIME || new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getGitHash()),
    __BUILD_TIME__: JSON.stringify(getBuildTime()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})