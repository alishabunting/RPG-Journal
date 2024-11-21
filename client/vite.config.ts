import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Get Replit-specific information
const isReplit = !!process.env.REPL_SLUG;
const replSlug = process.env.REPL_SLUG;
const replOwner = process.env.REPL_OWNER;

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: isReplit
      ? {
          clientPort: 443,
          host: `${replSlug}.${replOwner}.repl.co`,
          protocol: "wss",
          path: "/_hmr",
          timeout: 5000,
          overlay: true,
        }
      : true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, Authorization",
    },
    proxy: isReplit
      ? {
          "/_hmr": {
            target: `wss://${replSlug}.${replOwner}.repl.co`,
            ws: true,
            secure: true,
            changeOrigin: true,
          },
        }
      : undefined,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    sourcemap: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@replit/vite-plugin-shadcn-theme-json"],
  },
});
