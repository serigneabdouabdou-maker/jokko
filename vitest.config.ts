import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["**/*.live.test.ts", "node_modules/**"],
    env: { GEMINI_API_KEY: "" },
  },
});
