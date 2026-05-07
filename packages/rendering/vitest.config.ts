import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

export default {
  resolve: {
    alias: {
      "@galileo3d/rendering": resolve(root, "packages/rendering/src/index.ts"),
      "@galileo3d/scene": resolve(root, "packages/scene/src/index.ts"),
      "@galileo3d/math": resolve(root, "packages/math/src/index.ts"),
      "@galileo3d/core": resolve(root, "packages/core/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: [resolve(root, "tests/unit/rendering/**/*.test.ts"), resolve(root, "tests/unit/debug/rendering-diagnostics.test.ts")]
  }
};
