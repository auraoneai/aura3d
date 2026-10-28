import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Executes every `ts` block in docs/agents/genre-kits.md headless. tools/docs-codeblocks typechecks the same
// blocks, so a kit rename breaks the docs in CI and a behaviour change breaks the sentence under each example.
const DOC = "docs/agents/genre-kits.md";
const SCRATCH = resolve("tests/reports/genre-kit-examples");

function blocks(): { readonly title: string; readonly code: string }[] {
  const text = readFileSync(DOC, "utf8");
  const found: { title: string; code: string }[] = [];
  let title = "";
  for (const part of text.split(/^## /m).slice(1)) {
    title = part.split("\n", 1)[0]!.trim();
    const match = /```ts\n([\s\S]*?)```/.exec(part);
    if (match) found.push({ title, code: match[1]!.trim() });
  }
  return found;
}

async function run(title: string): Promise<Record<string, unknown>> {
  const block = blocks().find((entry) => entry.title === title);
  if (!block) throw new Error(`no ts block under "## ${title}" in ${DOC}`);
  mkdirSync(SCRATCH, { recursive: true });
  const file = join(SCRATCH, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ts`);
  writeFileSync(file, `${block.code}\n`);
  return (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
}

describe("docs/agents/genre-kits.md examples run", { timeout: 60_000 }, () => {
  afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

  it("documents one example per genre kit", () => {
    expect(blocks().map((entry) => entry.title)).toEqual(["Platformer", "Arcade kart", "Car soccer", "Fighting", "Racket sports"]);
  });

  it("platformer: holding right moves the player along the ground", async () => {
    const { platformerResult } = (await run("Platformer")) as { platformerResult: { x: number; status: string } };
    expect(platformerResult.x).toBeGreaterThan(0.5);
    expect(["playing", "completed"]).toContain(platformerResult.status);
  });

  it("arcade kart: full throttle gains speed and progress along the route", async () => {
    const { kartResult } = (await run("Arcade kart")) as { kartResult: { speed: number; progress: number; lap: number } };
    expect(kartResult.speed).toBeGreaterThan(5);
    expect(kartResult.progress).toBeGreaterThan(0);
  });

  it("car soccer: throttle moves the hero car", async () => {
    const { soccerResult } = (await run("Car soccer")) as { soccerResult: { heroSpeed: number; ballZ: number } };
    expect(soccerResult.heroSpeed).toBeGreaterThan(1);
    expect(Number.isFinite(soccerResult.ballZ)).toBe(true);
  });

  it("fighting: idle fighters stay idle without input", async () => {
    const { fightingResult } = (await run("Fighting")) as { fightingResult: { player: string; opponent: string } };
    expect(fightingResult).toEqual({ player: "idle", opponent: "idle" });
  });

  it("racket sports: four straight points win a game and 3-0 reads 40", async () => {
    const { racketResult } = (await run("Racket sports")) as { racketResult: { games: readonly number[]; label: string } };
    expect(racketResult.games).toEqual([1, 0]);
    expect(racketResult.label).toBe("40");
  });
});
