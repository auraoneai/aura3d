import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
console.log("imports ok");
const OUT = process.env.G2_OUT || "tests/reports/game-upgrade-2026-09/before/turbo";
const dir = resolve(OUT); mkdirSync(dir, { recursive: true });
console.log("dir ok", dir);
