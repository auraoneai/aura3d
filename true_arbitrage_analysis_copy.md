# True Arbitrage: Cross-Platform YES/YES and NO/NO Mispricing Harvest
## Polymarket ↔ Kalshi — Only identical (or near-identical) resolution events
### Dated: November 26, 2025

---

## Ground Rules (Risk-Free vs Risky)
- **Clean arb (risk-free):** Same event, same resolution source/date. Buy cheap YES + cheap NO across platforms so total cost < $1 (after fees). Payout = $1 regardless of outcome.  
- **Two-YES mispricing (resolution-mismatch play):** Buy YES on both if combined cost < $1. Pays $2 if both resolve YES; pays $1 if only one resolves YES (possible on feed/time mismatches). Loses full cost if both resolve NO.  
- **Two-NO mispricing:** Buy NO on both if combined cost < $1. Pays $2 if both resolve NO; pays $1 if only one resolves NO; loses cost if both resolve YES.  
- **Fees to subtract:** Kalshi per-contract fee (~$0.01-0.02). Polymarket gas is minimal but non-zero; include spread/slippage.

---

## Cleanest Targets (Same Resolution Source)
| Event | Resolution Source | Current Indicative Pricing | Arb Trigger (YES+NO) | Notes |
|-------|-------------------|---------------------------|----------------------|-------|
| **Fed Dec 2025 decision (cut vs hold)** | FOMC statement | PM cut YES ~0.84 / hold YES ~0.14; Kalshi cut YES ~0.85 / hold YES ~0.15 | If `PM cut YES + Kalshi hold YES < 0.97` **or** `Kalshi cut YES + PM hold YES < 0.97` | High liquidity; easiest true arb. |
| **Number of Fed cuts in 2025 (exact counts)** | Fed announcements | Prices vary by count; binaries on PM, multi on Kalshi | For each exact count: `PM YES(count) + Kalshi NO(count) < 0.97` | Both reference same Fed path; check every bracket. |
| **CPI threshold 2025 (e.g., ≥3.0%, ≥3.5%)** | BLS CPI | Need live prices; both list same thresholds | `PM YES(threshold) + Kalshi NO(threshold) < 0.97` | Releases monthly; spreads open right after print. |

**How to execute clean arb:**  
1) Identify same event/threshold.  
2) Compute `cheaper YES + cheaper NO`.  
3) If below $1 minus fees, buy both. Lock payout $1.

---

## Resolution-Mismatch Two-YES / Two-NO Targets (Not Risk-Free, but Can Pay on Split)
| Event | Why Split Can Happen | Two-YES Trigger | Two-NO Trigger | Comment |
|-------|----------------------|-----------------|----------------|---------|
| **Bitcoin yearly highs ($150k/$175k/$200k)** | Different price feeds (Kalshi CF Benchmarks RTI 60s avg vs PM Binance wick) | If `PM YES + Kalshi YES ≤ 0.90` | If `PM NO + Kalshi NO ≤ 0.90` | Use small size; expect occasional split resolutions on wicks. |
| **Bitcoin daily above/below** | Different timestamps (Kalshi 9pm ET vs PM midnight ET) + feed differences | `YES+YES ≤ 0.90` when news volatility expected | `NO+NO ≤ 0.90` if calm day priced cheap | Not clean arb; you’re paid if one side triggers and the other doesn’t. |
| **Ethereum annual highs** | Same issue as BTC (feed mismatch) | Same `YES+YES ≤ 0.90` rule | Same `NO+NO ≤ 0.90` rule | Lower liquidity than BTC. |

**Payout math (example YES+YES):**  
Cost = $0.44 (PM) + $0.44 (Kalshi) = $0.88.  
- If both YES → receive $2 → profit $1.12.  
- If one YES/one NO → receive $1 → profit $0.12.  
- If both NO → lose $0.88.  
Only do this where split or double-YES is plausible and odds are mispriced cheap.

---

## Quick Scan Checklist (Run Before Entries)
1) **Match the event:** Confirm identical wording, date/time, and source.  
2) **Compute spread:**  
   - Clean arb: `cheapest YES + cheapest NO < 1 - fees`.  
   - Two-YES/Two-NO: `YES_PM + YES_K` (or NO) ≪ 1 when split risk exists.  
3) **Cap size:** Use larger size only on clean arb (Fed/CPI). Keep mismatch plays small.  
4) **Record price + timestamp:** Spreads close fast; log fills for audit.  
5) **Fee check:** Deduct Kalshi fee + PM gas to confirm net positive.

---

## Live Targets to Watch (Based on current sheets)
- **Fed Dec cut vs hold:** Sitting near 0.99 combined; fire if it widens to ≤0.97.  
- **CPI ≥3.0% or ≥3.5%:** Check right after each CPI release; historical gaps open >3%.  
- **BTC $150k/$175k/$200k 2025:** Only if combined YES or NO costs collapse toward 0.85-0.90; otherwise skip due to feed risk.

---

## Fast Execution Template
```
Event: [e.g., Fed Dec cut]
PM YES @ [price]; PM NO @ [price]
K YES @ [price]; K NO @ [price]

Clean Arb Check:
  Option A: PM YES + K NO = ?
  Option B: K YES + PM NO = ?
  If either < 1 - fees -> execute that pair.

Mismatch Two-YES/Two-NO Check (only for feed/time risk events):
  YES_PM + YES_K = ?
  NO_PM + NO_K = ?
  If < 0.90 and split plausible -> small size.
```

---

## What NOT to Touch
- XRP/SOL/altcoins: No Kalshi listing → no cross-platform arb.  
- Stocks (TSLA, AAPL, etc.): Polymarket-only.  
- Weather/entertainment/gas/treasury spreads: Kalshi-only.  
- Any market with ambiguous resolution criteria (e.g., “national BTC reserve”) unless sources match exactly.
