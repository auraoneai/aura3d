import { expect, test, type Page } from "@playwright/test";

type AuraClashArenaProof = {
  route: string;
  app: "Aura Clash Arena";
  release: "1.0.10";
  version: string;
  status: "loading" | "running" | "paused" | "error";
  error: string | null;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  visibleFighterAsset: string;
  noPrimitiveFighters: true;
  renderer: {
    surface: "aura3d-production-gltf-animation";
    backend: string;
    drawCalls: number;
  };
  player: ProofFighter;
  rival: ProofFighter;
  animation: {
    visibleSkinnedGlb: true;
    skinnedDrawItems: number;
    playerSkinningBindings: number;
    rivalSkinningBindings: number;
    playerLastTracks: number;
    rivalLastTracks: number;
    playerLastSkinningPalettes: number;
    rivalLastSkinningPalettes: number;
    clips: readonly string[];
  };
  runtime: {
    frameLoop: boolean;
    input: boolean;
    deterministicCombat: boolean;
    hitWindows: boolean;
    hud: boolean;
    evidence: boolean;
  };
  controls: {
    lastInput: string;
    downSupported: boolean;
    specialRequiresMeter: boolean;
    koLocked: boolean;
    resetCount: number;
  };
  deterministicReplay: {
    kind: "aura-clash-deterministic-replay-proof";
    runner: "game.runSimulation";
    inputReplay: "game.inputReplay";
    frameCount: number;
    eventCount: number;
    finalHash: string;
    repeatedFinalHash: string;
    stable: boolean;
    exportedReplay: {
      schemaVersion: "aura-game-input-replay/v1";
      checksum: string;
      frameCount: number;
      duration: number;
    };
    finalSnapshot: {
      playerX: number;
      rivalHp: number;
      hits: number;
      ko: boolean;
      roundTime: number;
    };
  };
  fighterAssets: {
    player: { id: string; url: string; hash: string };
    rival: { id: string; url: string; hash: string };
    distinct: boolean;
    releaseReady: boolean;
  };
};

type ProofFighter = {
  name: string;
  health: number;
  meter: number;
  x: number;
  y: number;
  grounded: boolean;
  action: string;
  activeClip: string;
  attacking: string | null;
};

test("AuraClash boots Aura3D runtime", async ({ page }) => {
  const proof = await loadPlayable(page);
  expect(proof.route).toBe("/playable/");
  expect(proof.app).toBe("Aura Clash Arena");
  expect(proof.release).toBe("1.1.0");
  expect(proof.version).toBe("aura-clash-arena-production-gltf-animation-crossfade-reactions");
  expect(proof.status).toBe("running");
  expect(proof.runtime.frameLoop).toBe(true);
  expect(proof.runtime.evidence).toBe(true);
  expect(proof.deterministicReplay).toMatchObject({
    kind: "aura-clash-deterministic-replay-proof",
    runner: "game.runSimulation",
    inputReplay: "game.inputReplay",
    stable: true
  });
  expect(proof.deterministicReplay.finalHash).toBe(proof.deterministicReplay.repeatedFinalHash);
  expect(proof.deterministicReplay.eventCount).toBeGreaterThanOrEqual(20);
  expect(proof.deterministicReplay.exportedReplay.schemaVersion).toBe("aura-game-input-replay/v1");
  expect(proof.deterministicReplay.exportedReplay.frameCount).toBeGreaterThanOrEqual(200);
  expect(proof.deterministicReplay.finalSnapshot.rivalHp).toBe(0);
  expect(proof.deterministicReplay.finalSnapshot.ko).toBe(true);
  expect(proof.deterministicReplay.finalSnapshot.roundTime).toBeLessThan(99);
  await expect(page.locator("canvas#aura-clash-arena-canvas")).toBeVisible();
  expect(await page.locator("body").textContent()).not.toMatch(/Aura Clash V\d+/);
});

test("AuraClash advances frames", async ({ page }) => {
  const before = await loadPlayable(page);
  await expect.poll(async () => (await readProof(page)).frame).toBeGreaterThan(before.frame);
});

test("AuraClash loads GLB fighters", async ({ page }) => {
  const proof = await loadPlayable(page);
  expect(proof.noPrimitiveFighters).toBe(true);
  expect(proof.visibleFighterAsset).toMatch(/auraClashPlayerRig\.[a-f0-9]+\.glb$/);
  expect(proof.fighterAssets.distinct).toBe(true);
  expect(proof.fighterAssets.releaseReady).toBe(true);
  expect(proof.fighterAssets.player.id).toBe("auraClashPlayerRig");
  expect(proof.fighterAssets.rival.id).toBe("auraClashRivalRig");
  expect(proof.fighterAssets.player.hash).not.toBe(proof.fighterAssets.rival.hash);
  expect(proof.fighterAssets.player.id).not.toBe("auraClashTrainingMannequin");
  expect(proof.fighterAssets.rival.id).not.toBe("auraClashTrainingMannequin");
  expect(proof.animation.visibleSkinnedGlb).toBe(true);
  expect(proof.animation.skinnedDrawItems).toBeGreaterThan(0);
  expect(proof.animation.playerSkinningBindings).toBeGreaterThan(0);
  expect(proof.animation.rivalSkinningBindings).toBeGreaterThan(0);
  const statuses = await page.evaluate(async (urls) => Promise.all(urls.map((url) => fetch(url).then((response) => response.status))), [
    proof.fighterAssets.player.url,
    proof.fighterAssets.rival.url
  ]);
  expect(statuses).toEqual([200, 200]);
});

test("AuraClash responds to movement input", async ({ page }) => {
  const before = await loadPlayable(page);
  await hold(page, "KeyD", 700);
  const after = await readProof(page);
  expect(after.player.x).toBeGreaterThan(before.player.x + 0.08);
  expect(after.animation.playerLastTracks).toBeGreaterThan(0);
});

test("AuraClash crossfades between locomotion states (measurable blend window)", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyD");
  const blendFrames = await page.evaluate(async () => {
    const samples: Array<{ from: string | null; to: string; fromWeight: number; toWeight: number; blending: boolean }> = [];
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (): void => {
        const player = (window as unknown as { __AURA_CLASH_BLEND_PROOF__?: { player?: { from: string | null; to: string; fromWeight: number; toWeight: number; blending: boolean } } }).__AURA_CLASH_BLEND_PROOF__?.player;
        if (player) samples.push({ ...player });
        if (performance.now() - start > 450) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  await page.keyboard.up("KeyD");
  const realBlend = blendFrames.find(
    (f) => f.blending && f.from !== null && f.from !== f.to && f.fromWeight > 0.01 && f.toWeight > 0.01 && Math.abs(f.fromWeight + f.toWeight - 1) < 0.02
  );
  expect(realBlend, "expected a two-clip crossfade window (idle->walk) with weights summing to ~1").toBeTruthy();
});

test("AuraClash transitions are inertialized (critically-damped, not linear)", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyD");
  const result = await page.evaluate(async () => {
    type Entry = { from: string; to: string; inertializedFromWeight: number; linearFromWeight: number; nonLinear: boolean };
    let proof: { mode?: string; player?: Entry } | undefined;
    const start = performance.now();
    while (performance.now() - start < 600) {
      proof = (window as unknown as { __AURA_CLASH_INERTIALIZATION_PROOF__?: { mode?: string; player?: Entry } }).__AURA_CLASH_INERTIALIZATION_PROOF__;
      if (proof?.player?.nonLinear) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return proof;
  });
  await page.keyboard.up("KeyD");
  expect(result?.mode, "transition proof should report the inertialized mode").toBe("inertialized");
  expect(result?.player, "expected a recorded inertialized transition for the player").toBeTruthy();
  // The inertialized source weight must measurably diverge from the linear 1 - t/duration ramp.
  expect(result!.player!.nonLinear).toBe(true);
  expect(Math.abs(result!.player!.inertializedFromWeight - result!.player!.linearFromWeight)).toBeGreaterThan(1e-3);
});

test("AuraClash runs the 1.3 believable-motion runtimes (foot IK + spring body-sway)", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyD"); // walk -> feet plant (foot IK) + body accelerates (spring)
  const observed = await page.evaluate(async () => {
    type Entry = { groundedFeet: number; footIkApplied: number; maxFootSlideCorrected: number; springLag: number; footIkActive: boolean };
    type Proof = { source?: string; footIk?: boolean; springBones?: boolean; player?: Entry };
    let best: Proof | undefined;
    let maxGrounded = 0;
    let maxLag = 0;
    let sawFootIk = false;
    const start = performance.now();
    while (performance.now() - start < 900) {
      const proof = (window as unknown as { __AURA_CLASH_SECONDARY_MOTION_PROOF__?: Proof }).__AURA_CLASH_SECONDARY_MOTION_PROOF__;
      if (proof?.player) {
        best = proof;
        maxGrounded = Math.max(maxGrounded, proof.player.groundedFeet);
        maxLag = Math.max(maxLag, Math.abs(proof.player.springLag));
        if (proof.player.footIkActive) sawFootIk = true;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { best, maxGrounded, maxLag, sawFootIk };
  });
  await page.keyboard.up("KeyD");
  expect(observed.best?.source).toBe("aura3d-1.3-believable-motion");
  expect(observed.best?.footIk, "arena should report foot IK wired").toBe(true);
  expect(observed.best?.springBones, "arena should report spring bones wired").toBe(true);
  // Foot IK actually solved planted feet while walking, and the body spring lagged under acceleration.
  expect(observed.maxGrounded, "expected at least one planted/grounded foot while walking").toBeGreaterThanOrEqual(1);
  expect(observed.sawFootIk, "expected foot IK to solve a planted leg chain").toBe(true);
  expect(observed.maxLag, "expected the body spring to lag under acceleration").toBeGreaterThan(0);
});

test("AuraClash fires authored VFX clip-event markers during an attack (T2.2 event tracks)", async ({ page }) => {
  await loadPlayable(page);
  const fired = await page.evaluate(async () => {
    type Proof = { source?: string; firedEvents?: Record<string, number> };
    let proof: Proof | undefined;
    const start = performance.now();
    // throw several attacks so the authored vfx markers cross
    while (performance.now() - start < 1400) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK" }));
      await new Promise((r) => setTimeout(r, 60));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyK" }));
      await new Promise((r) => setTimeout(r, 120));
      proof = (window as unknown as { __AURA_CLASH_EVENT_TRACKS_PROOF__?: Proof }).__AURA_CLASH_EVENT_TRACKS_PROOF__;
      if ((proof?.firedEvents?.vfx ?? 0) > 0) break;
    }
    return proof;
  });
  expect(fired?.source).toBe("authored-clip-events");
  expect(fired?.firedEvents?.vfx ?? 0, "expected authored VFX markers to fire from attack clip events").toBeGreaterThan(0);
});

test("AuraClash layers an attack on the upper body while the lower body keeps moving", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyD"); // start moving
  await page.waitForTimeout(120);
  await page.keyboard.down("KeyJ"); // light attack while moving -> upper-body layer over walk base
  const layered = await page.evaluate(async () => {
    let found: { from: string | null; to: string } | null = null;
    const start = performance.now();
    while (performance.now() - start < 700) {
      const p = (window as unknown as { __AURA_CLASH_BLEND_PROOF__?: { player?: { from: string | null; to: string } } }).__AURA_CLASH_BLEND_PROOF__?.player;
      if (p && p.from === "Walk_Loop" && p.to !== "Walk_Loop" && p.to !== null) {
        found = { from: p.from, to: p.to };
        break;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return found;
  });
  await page.keyboard.up("KeyJ");
  await page.keyboard.up("KeyD");
  // base = Walk_Loop (lower body), to = an attack clip layered on the upper body
  expect(layered, "expected attack layered over a Walk_Loop base while moving").toBeTruthy();
  expect(layered!.to).not.toBe("Walk_Loop");
});

test("AuraClash makes Space dash visibly even without a direction key", async ({ page }) => {
  const before = await loadPlayable(page);
  await hold(page, "Space", 260);
  const after = await readProof(page);
  expect(after.controls.lastInput).toBe("dash");
  expect(after.player.action, "Space alone should enter run/dash state instead of only playing a cue").toBe("run");
  expect(after.player.x, "Space alone should visibly move in the fighter's facing direction").toBeGreaterThan(before.player.x + 0.12);
});

test("AuraClash supports down and fast-fall input", async ({ page }) => {
  await loadPlayable(page);
  await hold(page, "KeyS", 260);
  await expect.poll(async () => (await readProof(page)).player.action).toBe("down");
  await expect.poll(async () => (await readProof(page)).player.activeClip).toBe("Crouch_Idle_Loop");
  await hold(page, "KeyW", 100);
  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await readProof(page)).controls.lastInput).toBe("down");
  await page.keyboard.up("KeyS");
});

test("AuraClash supports diagonal jump drift and air attacks", async ({ page }) => {
  const start = await loadPlayable(page);
  await page.keyboard.down("KeyD");
  await page.keyboard.press("KeyW");
  await expect.poll(async () => (await readProof(page)).player.y, {
    message: "diagonal jump should lift the player"
  }).toBeGreaterThan(0.35);
  const rightJump = await readProof(page);
  expect(rightJump.player.x, "holding right while jumping should drift right").toBeGreaterThan(start.player.x + 0.1);

  await page.keyboard.down("KeyJ");
  await expect.poll(async () => {
    const proof = await readProof(page);
    return `${proof.player.grounded}:${proof.player.attacking ?? proof.player.action}:${proof.player.activeClip}`;
  }, {
    message: "J should start a readable attack while airborne"
  }).toMatch(/false:light:.*Punch_Jab/i);
  await page.keyboard.up("KeyJ");
  await page.keyboard.up("KeyD");

  await expect.poll(async () => (await readProof(page)).player.grounded, {
    message: "player should recover to ground before the left jump check"
  }).toBe(true);
  const beforeLeft = await readProof(page);
  await page.keyboard.down("KeyA");
  await page.keyboard.press("KeyW");
  await expect.poll(async () => (await readProof(page)).player.y, {
    message: "left diagonal jump should lift the player"
  }).toBeGreaterThan(0.35);
  const leftJump = await readProof(page);
  expect(leftJump.player.x, "holding left while jumping should drift left").toBeLessThan(beforeLeft.player.x - 0.1);
  await page.keyboard.up("KeyA");
});

test("AuraClash allows crouch attacks and makes L a real power special", async ({ page }) => {
  await loadPlayable(page, "?auraTestDriver=1");
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });

  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await readProof(page)).player.action, {
    message: "S should put the fighter into the down/kneel state"
  }).toBe("down");
  await page.keyboard.down("KeyJ");
  await expect.poll(async () => {
    const proof = await readProof(page);
    return `${proof.player.attacking ?? proof.player.action}:${proof.player.activeClip}`;
  }, {
    message: "J should start a heavy uppercut-style attack from down/kneel"
  }).toMatch(/heavy:.*Punch_Cross/i);
  await page.keyboard.up("KeyJ");
  await page.keyboard.up("KeyS");

  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash special power test driver was not installed.");
    driver.setPositions(-0.95, 0.58);
    driver.setRivalHealth(360);
    driver.setPlayerMeter(100);
  });
  const beforeSpecial = await readProof(page);
  await hold(page, "KeyL", 220);
  await expect.poll(async () => (await readProof(page)).player.attacking ?? (await readProof(page)).player.action, {
    message: "L should reliably expose special instead of silently doing little or nothing"
  }).toBe("special");
  await expect.poll(async () => (await readProof(page)).rival.health, {
    message: "L special should do power-move damage at readable range"
  }).toBeLessThanOrEqual(beforeSpecial.rival.health - 35);
});

test("AuraClash supports guard input", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("ShiftLeft");
  await expect.poll(async () => (await readProof(page)).player.action).toBe("guard");
  const proof = await readProof(page);
  expect(proof.controls.lastInput).toBe("guard");
  await page.keyboard.up("ShiftLeft");
});

test("AuraClash plays attack animation", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyJ");
  await expect.poll(async () => (await readProof(page)).player.activeClip).toBe("Punch_Jab");
  await page.keyboard.up("KeyJ");
});

test("AuraClash gates special without crashing or pausing", async ({ page }) => {
  const before = await loadPlayable(page);
  expect(before.controls.specialRequiresMeter).toBe(true);
  await hold(page, "KeyL", 240);
  const after = await readProof(page);
  expect(after.status).toBe("running");
  expect(after.error).toBeNull();
  expect(after.controls.lastInput).toBe("special");
  expect(after.player.health).toBe(before.player.health);
});

test("AuraClash resolves a hit", async ({ page }) => {
  const before = await loadPlayable(page);
  const proof = await landPlayerHit(page);
  expect(proof.totalHits).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(before.rival.health);
  expect(proof.rival.health).toBeGreaterThan(0);
  expect(proof.lastHitFrame).toBeGreaterThan(0);
  expect(proof.callout).toBe("HIT");
  expect(Math.abs(proof.rival.x - proof.player.x)).toBeGreaterThanOrEqual(0.72);
  expect(proof.player.grounded).toBe(true);
});

test("AuraClash updates HUD health", async ({ page }) => {
  const proof = await landPlayerHit(page);
  await expect(page.locator("#rival-state")).toContainText(`${proof.rival.health} HP`);
  await expect(page.locator("#toast")).toContainText(/lands|damage/i);
});

test("AuraClash supports pause", async ({ page }) => {
  await loadPlayable(page);
  await hold(page, "KeyP", 180);
  await expect.poll(async () => (await readProof(page)).status).toBe("paused");
  await expect(page.locator("#callout")).toHaveText("PAUSE");
  await hold(page, "KeyP", 180);
  await expect.poll(async () => (await readProof(page)).status).toBe("running");
});

test("AuraClash captures visual proof screenshots", async ({ page }) => {
  test.setTimeout(60_000);
  await loadPlayable(page);
  await page.screenshot({ path: "launch-evidence/aura-clash-arena-first-frame.png", fullPage: true });
  const proof = await landPlayerHit(page);
  await page.screenshot({ path: "launch-evidence/aura-clash-arena-combat-frame.png", fullPage: true });
  expect(proof.animation.playerLastSkinningPalettes + proof.animation.rivalLastSkinningPalettes).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(360);
});

test("AuraClash locks combat after KO and reset clears the round; any control starts the next round", async ({ page }) => {
  test.setTimeout(35_000);
  await loadPlayable(page, "?auraTestDriver=1");
  await queueNearKoHeavy(page);
  await expect.poll(async () => (await readProof(page)).rival.health, {
    message: "deterministic heavy strike should KO the near-KO rival through the normal resolver"
  }).toBe(0);
  const proof = await readProof(page);
  expect(proof.rival.health).toBe(0);
  expect(proof.controls.koLocked).toBe(true);
  const hitsAtKo = proof.totalHits;
  await page.waitForTimeout(260);
  const afterKo = await readProof(page);
  expect(afterKo.totalHits).toBe(hitsAtKo);
  await hold(page, "KeyL", 180);
  await expect.poll(async () => (await readProof(page)).controls.resetCount).toBeGreaterThan(0);
  const reset = await readProof(page);
  expect(reset.player.health).toBe(360);
  expect(reset.rival.health).toBe(360);
  expect(reset.totalHits).toBe(0);
  expect(reset.controls.koLocked).toBe(false);
});

test("AuraClash repeated special input cannot pause, crash, or wedge the route", async ({ page }) => {
  test.setTimeout(60_000);
  await loadPlayable(page, "?auraTestDriver=1");
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash special test driver was not installed.");
    driver.setPositions(-0.95, 0.52);
    driver.setRivalHealth(360);
    driver.setPlayerMeter(100);
  });

  for (let index = 0; index < 6; index += 1) {
    await hold(page, "KeyL", 140);
    await page.waitForTimeout(160);
    const proof = await readProof(page);
    expect(proof.status, `special press ${index + 1} should keep the route running`).toBe("running");
    expect(proof.error, `special press ${index + 1} should not publish a frame error`).toBeNull();
    expect(proof.callout, `special press ${index + 1} should not pause the game`).not.toBe("PAUSE");
    expect(proof.controls.lastInput).toBe("special");
  }
});

async function loadPlayable(page: Page, search = ""): Promise<AuraClashArenaProof> {
  await page.goto(`/playable/${search}`, { waitUntil: "networkidle" });
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__));
  const proof = await readProof(page);
  expect(proof.error).toBeNull();
  return proof;
}

async function readProof(page: Page): Promise<AuraClashArenaProof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
  });
  expect(proof).toBeTruthy();
  return proof!;
}

async function queueNearKoHeavy(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: "light" | "heavy" | "special"): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash KO test driver was not installed.");
    driver.setPositions(-0.95, 0.5);
    driver.setRivalHealth(9);
    driver.setPlayerMeter(100);
    driver.queuePlayerAttack("heavy");
  });
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function landPlayerHit(page: Page, options: { reload?: boolean } = {}): Promise<AuraClashArenaProof> {
  const start = options.reload !== false ? await loadPlayable(page, "?auraTestDriver=1") : await readProof(page);
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: "heavy"): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash hit test driver was not installed.");
    driver.setPositions(-0.95, 0.5);
    driver.setPlayerMeter(100);
    driver.queuePlayerAttack("heavy");
  });
  await expect.poll(async () => (await readProof(page)).rival.health, { timeout: 10_000 }).toBeLessThan(start.rival.health);
  return readProof(page);
}

async function approachCombatRange(page: Page): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    const proof = await readProof(page);
    const gap = proof.rival.x - proof.player.x;
    if (Math.abs(gap) >= 0.9 && Math.abs(gap) <= 1.18 && proof.player.grounded) return;
    await hold(page, gap > 0 ? "KeyD" : "KeyA", Math.abs(gap) > 1.25 ? 180 : 70);
  }
}
