import { defineConfig } from "vitest/config";

// Minimal config: the lane tests exercise pure game math (src/game/world.ts,
// themes.ts) and do not need the dev-server plugins or asset aliases from
// vite.config.ts / the repo root config.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
