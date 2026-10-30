import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.live.test.ts"],
    testTimeout: 45_000,
    env: loadEnv("test", process.cwd(), "GEMINI_"),
  },
});
