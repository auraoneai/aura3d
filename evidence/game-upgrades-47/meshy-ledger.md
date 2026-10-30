# GU47 Meshy ledger (WP-36)

Generated 2026-10-30T09:01:19.228Z by `wp36-pipeline.mjs ledger-md` from `~/.aura3d/meshy-ledger.jsonl` (tags `gu47-<slug>`, latest record per reservation wins; failed calls count 0, reserved/unconfirmed count their estimate).

Total: **320 credits** over 25 paid calls (3 failed, 16 ok, 6 reserved).

## By op

| Op | Calls | Failed (0 credits) | Credits |
|---|---|---|---|
| preview | 13 | 3 | 200 |
| retexture | 5 | 0 | 50 |
| refine | 7 | 0 | 70 |

## By game

| Game | Calls | preview | refine | retexture | rigging | animate | Total |
|---|---|---|---|---|---|---|---|
| top-tennis | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| roadster-rush | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| heatsink | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| teleoperator | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| iron-crown | 4 | 20 | 10 | 0 | 0 | 0 | 30 |
| pips-big-leap | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-hoops-3d | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| aura-diamond-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-fc-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-links-3d | 1 | 20 | 0 | 0 | 0 | 0 | 20 |
| bunker-zero | 3 | 20 | 10 | 0 | 0 | 0 | 30 |
| slingshot-siege | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| dot-dash-3d | 1 | 20 | 0 | 0 | 0 | 0 | 20 |
| cross-hop | 1 | 20 | 0 | 0 | 0 | 0 | 20 |
| strange-orbit-port | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| splat-rush-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| serpentine-sky-run-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| drift-and-deliver-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| heatsink-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ninja-runner-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| last-train-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| roadster-hours-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| where-the-wind-wanders-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| silt-and-signal-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cloud-runner-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Reconciliation with the Kiro Prism pool

- Baseline (pipeline start, 2026-10-30T08:53:09.841Z): pool 9757 credits (sum of key balances; Prism usable total 9747).
- Now (2026-10-30T09:01:19.510Z): pool 7937 credits (sum of key balances); usable (keys in state ok, Prism totals): **1537**.
- Ledger `reconcile` since the baseline: Prism 1820, ledger 320 (GU47 tags 320), delta 1500.
- Balance drop on keys that are still usable: 320 credits vs GU47 ledger 320 (difference 0; reserved/in-flight tasks count in the ledger before Meshy charges them).
- Keys parked by Prism after answering HTTP 402 although they report a balance (Prism sets their local balance to 0; not a Meshy charge, they return at their reset): meshy-12-87b2a6 500 -> 0, meshy-16-d9b27e 500 -> 0, meshy-22-acf24f 500 -> 0.
- Keys topped up or reset since the baseline (excluded, never negative spend): none; unconfirmed reservations: 0.
- The pool is shared, so other consumers, monthly resets and top-ups move the Prism number; a positive delta means Prism charged more than the ledger counted.
