# GU47 Meshy ledger (WP-36)

Generated 2026-10-30T09:12:19.678Z by `wp36-pipeline.mjs ledger-md` from `~/.aura3d/meshy-ledger.jsonl` (tags `gu47-<slug>`, latest record per reservation wins; failed calls count 0, reserved/unconfirmed count their estimate).

Total: **543 credits** over 82 paid calls (39 failed, 43 ok).

## By op

| Op | Calls | Failed (0 credits) | Credits |
|---|---|---|---|
| preview | 17 | 3 | 280 |
| retexture | 11 | 1 | 100 |
| refine | 14 | 0 | 140 |
| rigging | 9 | 5 | 20 |
| animate | 31 | 30 | 3 |

## By game

| Game | Calls | preview | refine | retexture | rigging | animate | Total |
|---|---|---|---|---|---|---|---|
| top-tennis | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| roadster-rush | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| heatsink | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| teleoperator | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| iron-crown | 22 | 20 | 10 | 0 | 0 | 0 | 30 |
| pips-big-leap | 3 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-hoops-3d | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| aura-diamond-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-fc-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| aura-links-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| bunker-zero | 15 | 20 | 10 | 0 | 15 | 0 | 45 |
| slingshot-siege | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| dot-dash-3d | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| cross-hop | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| strange-orbit-port | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| splat-rush-port | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| serpentine-sky-run-port | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| drift-and-deliver-port | 1 | 0 | 0 | 10 | 0 | 0 | 10 |
| heatsink-port | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| ninja-runner-port | 2 | 0 | 0 | 10 | 0 | 0 | 10 |
| last-train-port | 5 | 0 | 0 | 10 | 0 | 0 | 10 |
| roadster-hours-port | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| where-the-wind-wanders-port | 2 | 20 | 10 | 0 | 0 | 0 | 30 |
| silt-and-signal-port | 6 | 0 | 0 | 10 | 5 | 3 | 18 |
| cloud-runner-port | 1 | 0 | 0 | 10 | 0 | 0 | 10 |

## Reconciliation with the Kiro Prism pool

- Baseline (pipeline start, 2026-10-30T08:53:09.841Z): pool 9757 credits (sum of key balances; Prism usable total 9747).
- Now (2026-10-30T09:12:19.898Z): pool 9210 credits (sum of key balances); usable (keys in state ok, Prism totals): **?**.
- Ledger `reconcile` since the baseline: Prism 547, ledger 543 (GU47 tags 543), delta 4.
- Key balances that changed since the baseline: meshy-01-fb1bd8 8 -> 0 (exhausted), meshy-02-7f2a0e 7 -> 0 (exhausted), meshy-04-240013 516 -> 0 (exhausted), meshy-15-e4295a 16 -> 0 (exhausted).
- Keys that still report a balance but are parked (they answered HTTP 402 to paid calls; Prism retries them only after their reset, next 2026-11-01T00:00:00Z): meshy-06-e3fd09 (1100), meshy-07-23d8f5 (100), meshy-08-298a90 (140), meshy-09-1ec10b (500), meshy-10-c79bed (100), meshy-11-1e3e1e (1460), meshy-12-87b2a6 (500), meshy-13-92fc45 (120), meshy-14-5b6773 (100), meshy-16-d9b27e (500), meshy-17-e755bc (100), meshy-18-06bbe6 (310), meshy-19-c9fd3c (200), meshy-20-d7b275 (200), meshy-21-fb0061 (1490), meshy-22-acf24f (500), meshy-24-cecf62 (520), meshy-25-c1786e (100), meshy-26-7929a2 (300), meshy-27-b146c7 (400), meshy-28-631ae6 (150), meshy-29-11698f (310); 9200 credits not spendable now.
- Keys topped up or reset since the baseline (excluded, never negative spend): none; unconfirmed reservations: 0.
- The pool is shared, so other consumers, monthly resets and top-ups move the Prism number; a positive delta means Prism charged more than the ledger counted.
