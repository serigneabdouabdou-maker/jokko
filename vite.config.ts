import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { jokkoApi } from "./server/plugin.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), jokkoApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: { usePolling: true, interval: 300 },
  },
});
