// Scene 19-room-environment-parity rendered with three@0.185.1.
// The scene content lives in shared/scenes.ts. Unlike 13-ibl-only (plain
// runThreeScene over an authored HDRI), the three arm must run
// runThreeShowcase: `showcase.environmentStandIn: "room-environment"` is only
// consumed in three/lib/showcase.ts, which binds
// PMREMGenerator.fromScene(new RoomEnvironment(), 0.04) with
// scene.environmentIntensity = spec.environment?.intensity ?? 1 — the exact
// r185 neutral room the Aura analytic sampler ports.
import { getSceneSpec } from "../shared/scenes";
import { runThreeShowcase } from "./lib/showcase";
import type { RunOptions } from "./common";

export default (host: HTMLElement, opts?: RunOptions) => runThreeShowcase(getSceneSpec("19-room-environment-parity"), host, opts);
