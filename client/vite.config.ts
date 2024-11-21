import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
    hmr: isReplit ? {
      clientPort: 443,
      host: `${replSlug}.${replOwner}.repl.co`,
      protocol: "wss",
      timeout: 120000,
      overlay: false,
      path: "/_hmr"
    } : true,
    watch: {
      usePolling: true,
      interval: 3000,
      ignoreInitial: true
    },
    cors: {
      origin: [
        `https://${replSlug}.${replOwner}.repl.co`,
        `https://${replSlug}--5173.${replOwner}.repl.co`,
        "http://localhost:5173"
      ],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true
    },
    proxy: {
      "/_hmr": {
        target: `wss://${replSlug}.${replOwner}.repl.co`,
        ws: true,
        secure: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    minify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'wouter']
        }
      }
    }
  },
  optimizeDeps: {
    force: true,
    exclude: ['@replit/vite-plugin-shadcn-theme-json']
  },
  clearScreen: false,
  preview: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0"
  }
});
