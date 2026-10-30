// node --test artifacts/gu47-meshy/_tools/wp36-decisions.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CHAIN_RESTARTS, PRISM_REFUSAL, classifyCreateFailure, followUpRecovery, idleDecision, maxUsable, poolExhausted } from "./wp36-decisions.mjs";

const PARENT_402 = 'meshy api 402 on /animations: {"detail":"parent_key_exhausted: the Meshy account that owns the parent task is out of credits."}';
const QUOTA_503 = 'meshy api 503 on /animations: {"detail":"quota_exhausted"}';
const pool = (...balances) => ({ keys: balances.map((b, i) => ({ id: `k${i}`, state: b < 0 ? "exhausted" : "ok", remaining: Math.abs(b), inflight: 0 })) });

test("parent_key_exhausted is a per-account failure whether or not the call was marked pinned", () => {
  assert.equal(classifyCreateFailure(1, PARENT_402, true), "pinned-exhausted");
  assert.equal(classifyCreateFailure(1, PARENT_402, false), "pinned-exhausted");
});

test("bare quota_exhausted (older Prism) is per-account on a pinned call, pool-wide on an unpinned one", () => {
  assert.equal(classifyCreateFailure(1, QUOTA_503, true), "pinned-exhausted");
  assert.equal(classifyCreateFailure(1, QUOTA_503, false), "credits");
  assert.equal(classifyCreateFailure(9, "", false), "credits");
});

test("other create failures", () => {
  assert.equal(classifyCreateFailure(1, 'meshy api 503 on /rigging: {"detail":"busy"}', false), "rate");
  assert.equal(classifyCreateFailure(3, "", false), "auth");
  assert.equal(classifyCreateFailure(4, "", false), "invalid");
  assert.equal(classifyCreateFailure(1, "socket hang up", false), "transient");
});

test("Prism refusals before a task exists are recognised (settled as no-charge)", () => {
  assert.equal(PRISM_REFUSAL.exec(PARENT_402)?.[1], "parent_key_exhausted");
  assert.equal(PRISM_REFUSAL.exec(QUOTA_503)?.[1], "quota_exhausted");
  assert.equal(PRISM_REFUSAL.exec("meshy api 500: upstream"), null);
});

test("drained parent: refine starts a new preview, animate re-rigs, both bounded", () => {
  assert.equal(followUpRecovery("refine", 0), "new-preview");
  assert.equal(followUpRecovery("animate", undefined), "rerig");
  assert.equal(followUpRecovery("animate", MAX_CHAIN_RESTARTS - 1), "rerig");
  assert.equal(followUpRecovery("animate", MAX_CHAIN_RESTARTS), "defer");
  assert.equal(followUpRecovery("refine", MAX_CHAIN_RESTARTS), "defer");
});

test("pool exhaustion means no usable key can pay the cheapest op", () => {
  assert.equal(maxUsable(pool(-1000, 1490, 100)), 1490);
  assert.equal(poolExhausted(pool(-2000, -3, 1490)), false);
  assert.equal(poolExhausted(pool(-2000, 4, 3)), true);
  assert.equal(poolExhausted(undefined), false); // unreadable pool is not exhaustion
});

test("only a genuine whole-pool exhaustion parks the queue until reset", () => {
  const funded = pool(-0, -2, 1490);
  const empty = pool(-0, -2, 3);
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: empty, waitForCredits: true }), "wait-reset");
  // drained parent accounts only (the 2026-10-30 stall): pool still funded, so re-check instead of waiting days
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: funded, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 10, stopNew: false, pool: empty, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: undefined, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 0, stopNew: true, pool: empty, waitForCredits: true }), "end");
  assert.equal(idleDecision({ remaining: 5, stopNew: false, pool: funded, waitForCredits: false }), "end");
});
