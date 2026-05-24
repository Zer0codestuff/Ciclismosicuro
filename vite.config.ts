/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Set VITE_BASE_PATH=/repo-name/ when deploying to a GitHub Pages project site. */
function normalizeBasePath(value: string | undefined) {
  if (!value || value === "/") return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

const base = normalizeBasePath(process.env.VITE_BASE_PATH);

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          icons: ["lucide-react"],
          map: ["leaflet"]
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api/overpass": {
        target: "https://overpass.private.coffee",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/overpass/, "/api/interpreter")
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
