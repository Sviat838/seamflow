import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Live tests hit paid APIs; run them explicitly with LIVE_AI=1.
    exclude: ["**/node_modules/**", ...(process.env.LIVE_AI ? [] : ["src/**/*.live.test.ts"])],
  },
});
