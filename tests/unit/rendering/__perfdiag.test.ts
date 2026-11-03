import { it } from "vitest";
import v8 from "node:v8";
import { mountFakeCube } from "../../support/fakeWebGl2";
it("diag", async () => {
  const saved = process.env; process.env = {} as NodeJS.ProcessEnv;
  try {
    const { frame, calls } = await mountFakeCube("auto");
    for (let i = 0; i < 600; i += 1) frame();
    for (const k of Object.keys(calls)) delete calls[k];
    const a = (v8.getHeapStatistics() as any).total_allocated_bytes;
    for (let i = 0; i < 100; i += 1) frame();
    const b = (v8.getHeapStatistics() as any).total_allocated_bytes;
    const rows = Object.entries(calls).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v / 100}`);
    const total = Object.values(calls).reduce((s, c) => s + c, 0) / 100;
    console.log("TOTAL", total, "ALLOC", (b - a) / 100, "\n" + rows.join("\n"));
  } finally { process.env = saved; }
}, 120000);
