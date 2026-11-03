import { defineConfig } from "vitest/config";
import { sourceAliases } from "../../vitest.config";

// Use the same registry-derived aliases as the main source test config,
// including all opt-in entrypoints before their package roots.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/assets/**/*.test.ts"],
    server: { deps: { inline: [/^@aura3d\//, /^@aura3d$/] } }
  },
  resolve: { alias: sourceAliases, dedupe: ["react", "react-dom"] }
});
