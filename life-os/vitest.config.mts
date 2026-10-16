import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React server condition; it's a no-op in tests.
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
