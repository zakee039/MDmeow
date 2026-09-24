import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  clearScreen: false,
  // CodeMirror language packages may pull a second copy of @lezer/highlight
  // through pnpm. Lezer NodeProp identities must be shared, otherwise parsers
  // still parse correctly but syntax-highlighting tags become invisible to
  // @codemirror/language. Force the whole browser bundle onto the root copy.
  resolve: {
    dedupe: ["@lezer/highlight"],
  },
  // Env vars starting with these prefixes are exposed to the client.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // The bundled system WebViews are all evergreen Chromium / WebKit.
    target: ["es2022", "chrome110", "safari15"],
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
