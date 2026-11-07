import { describe, expect, it } from "vitest";
import { drainPopups, POPUP_LIMIT, type Popup } from "../../../examples/shared/runner-kit/popups";

const popup = (seq: number): Popup => ({ n: seq, seq, text: `+${seq}`, color: "#ffffff", size: 1, at: seq / 60 });

/** The sim-side contract: push, keep only the last POPUP_LIMIT, never clear. */
function pushCapped(list: Popup[], p: Popup): void {
  list.push(p);
  if (list.length > POPUP_LIMIT) list.splice(0, list.length - POPUP_LIMIT);
}

describe("runner-kit drainPopups (C2 regression)", () => {
  it("drains fresh popups by seq and advances the cursor", () => {
    const list = [popup(0), popup(1), popup(2)];
    const first = drainPopups(list, 0);
    expect(first.fresh.map((p) => p.seq)).toEqual([0, 1, 2]);
    expect(first.nextSeq).toBe(3);
    const again = drainPopups(list, first.nextSeq);
    expect(again.fresh).toEqual([]);
    expect(again.nextSeq).toBe(3);
  });

  it("keeps draining past 64 entries while the sim trims to the last 64", () => {
    const list: Popup[] = [];
    let nextSeq = 0;
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      pushCapped(list, popup(i));
      const drained = drainPopups(list, nextSeq);
      nextSeq = drained.nextSeq;
      for (const p of drained.fresh) expect(p.seq).toBe(seen++);
    }
    expect(seen).toBe(200);
    expect(list.length).toBe(POPUP_LIMIT);
  });

  it("does not stall when the reader falls behind and the list has wrapped", () => {
    const list: Popup[] = [];
    for (let i = 0; i < 100; i++) pushCapped(list, popup(i));
    const drained = drainPopups(list, 0);
    expect(drained.fresh.map((p) => p.seq)).toEqual(Array.from({ length: 64 }, (_, i) => i + 36));
    expect(drained.nextSeq).toBe(100);
  });

  it("survives restarts because seq is monotonic across them", () => {
    const list: Popup[] = [popup(10), popup(11)];
    let nextSeq = drainPopups(list, 0).nextSeq;
    list.length = 0;
    pushCapped(list, popup(12));
    const drained = drainPopups(list, nextSeq);
    expect(drained.fresh.map((p) => p.seq)).toEqual([12]);
    nextSeq = drained.nextSeq;
    expect(nextSeq).toBe(13);
  });
});