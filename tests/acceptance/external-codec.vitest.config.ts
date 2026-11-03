import { defineConfig } from "vitest/config";

// Only the explicitly gated external codec cell may use this config. Do not
// inherit workspace source aliases: the test resolves the verified installed
// candidate from its isolated project instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/acceptance/gltf-external-decoder-fixtures.test.ts"]
  }
});
