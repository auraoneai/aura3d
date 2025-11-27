# Cross-Platform Arbitrage Map: Kalshi vs Polymarket

## 🚨 KEY FINDING

**Kalshi only offers Bitcoin and Ethereum for crypto markets.** They do NOT have XRP, SOL, DOGE, or other altcoins.

This means:
- **NO cross-platform arbitrage possible** for XRP, SOL, ETH (Polymarket only)
- **TRUE overlap exists only for:** Fed decisions, CPI/Inflation, and Bitcoin thresholds
- **Stock price targets (TSLA, AAPL, NVDA, etc.)** are Polymarket-only

---

## Executive Summary

This document maps **identical markets** that exist on BOTH platforms, plus **frequency-matched opportunities** where daily→weekly or weekly→monthly resolutions align.

---

## QUICK REFERENCE: WHAT OVERLAPS VS WHAT DOESN'T

### ✅ TRUE OVERLAPS (Can potentially arb)

| Market | Kalshi | Polymarket | Resolution Source |
|--------|--------|------------|-------------------|
| Fed Dec 2025 Decision | ✅ | ✅ | FOMC Statement (same) |
| Number of Fed Rate Cuts 2025 | ✅ | ✅ | Fed announcements (same) |
| CPI/Inflation Thresholds | ✅ | ✅ | BLS Reports (same) |
| Bitcoin EOY High | ✅ | ✅ | ⚠️ DIFFERENT (CFB vs Binance) |
| Bitcoin Daily/Weekly Range | ✅ | ✅ | ⚠️ DIFFERENT (CFB vs Binance) |
| Ethereum Price | ✅ | ✅ | ⚠️ DIFFERENT sources |

### ❌ NO OVERLAP (Cannot arb)

| Market Type | Kalshi | Polymarket |
|-------------|--------|------------|
| XRP Price | ❌ No | ✅ Yes |
| SOL Price | ❌ No | ✅ Yes |
| DOGE Price | ❌ No | ✅ Yes |
| Other Altcoins | ❌ No | ✅ Yes |
| Stock Targets (TSLA, AAPL, etc.) | ❌ No | ✅ Yes |
| Weather (Snow, Rain, Tornadoes) | ✅ Yes | ❌ No |
| Netflix Top 10 | ✅ Yes | ❌ No |
| Billboard Hot 100 | ✅ Yes | ❌ No |
| Gas Prices | ✅ Yes | ❌ No |
| Treasury Yields | ✅ Yes | ❌ No |
| Jobs Report Ranges | ✅ Yes | ❌ Limited |

---

## CATEGORY 1: EXACT OVERLAPPING MARKETS

These are markets where BOTH platforms offer the same underlying event with the same resolution criteria.

### 1. FED DECEMBER 2025 DECISION ⭐ HIGH LIQUIDITY

| Platform | Market | Current Odds | Notes |
|----------|--------|--------------|-------|
| **Kalshi** | Fed meeting December 2025 | ~85% cut / ~15% hold | CFTC regulated |
| **Polymarket** | Fed decision in December | 84% 25bps cut / 14% no change | Crypto settled |

**Arbitrage Check:**
- YES (cut) + NO (hold) should = 100%
- If Kalshi 85% cut + Polymarket 14% no change = 99% → 1% spread exists
- If prices diverge by 3%+ → actionable arb

**Resolution:** Dec 9-10, 2025 FOMC meeting
**Resolution Source:** Federal Reserve statement

---

### 2. NUMBER OF FED RATE CUTS IN 2025 ⭐ HIGH LIQUIDITY

| Platform | Market | Structure |
|----------|--------|-----------|
| **Kalshi** | kxratecutcount | Multiple choice (0, 1, 2, 3, 4+ cuts) |
| **Polymarket** | How many Fed rate cuts in 2025? | Binary per count (exactly 2 cuts, exactly 3 cuts, etc.) |

**Key Strikes to Compare:**
- "Exactly 2 cuts" - compare YES prices on both
- "Exactly 3 cuts" - compare YES prices on both

**Arb Opportunity:** If sum of all outcomes < $1 on either platform, guaranteed profit exists.

---

### 3. BITCOIN YEARLY HIGH THRESHOLDS ⭐ MEDIUM LIQUIDITY

| Platform | Market | Strikes Available |
|----------|--------|-------------------|
| **Kalshi** | How high will Bitcoin get this year? | $100K, $110K, $125K, $150K, $175K, $200K |
| **Polymarket** | What price will Bitcoin hit in 2025? | $150K, $175K, $200K, $250K, $500K, $1M |

**Overlapping Strikes:** $150K, $175K, $200K

**For Each Overlapping Strike:**
- Compare Kalshi YES price vs Polymarket YES price
- If Kalshi $150K YES = 70% and Polymarket $150K YES = 62%
- → Buy Polymarket YES at 62¢, Sell (don't buy) Kalshi YES at 70¢
- Risk: Different resolution sources (CFB RTI vs Binance)

**CRITICAL WARNING:** Resolution sources differ!
- Kalshi uses CF Benchmarks Real-Time Index (RTI)
- Polymarket uses Binance BTCUSDT 1-minute candles
- Price discrepancy at resolution time could cause both to resolve differently

---

### 4. BITCOIN DAILY ABOVE/BELOW ⭐ HIGH FREQUENCY

| Platform | Market Type | Resolution Time |
|----------|-------------|-----------------|
| **Kalshi** | Bitcoin price Above/below | 9:00 PM ET daily |
| **Polymarket** | Bitcoin above ___ on [date] | 12:00 AM ET daily |

**ISSUE:** Different resolution times (9 PM vs midnight) - NOT a true overlap

**Strategy:** Use for correlation trades, not direct arb

---

### 5. CPI/INFLATION ANNUAL ⭐ MEDIUM LIQUIDITY

| Platform | Market | Structure |
|----------|--------|-----------|
| **Kalshi** | How high will inflation get in 2025? | Multiple strikes (2.5%, 3.0%, 3.5%, 4.0%+) |
| **Polymarket** | How high will inflation get in 2025? | Same structure (3.1%+, 3.5%+, 4.0%+) |

**Overlapping Strikes:** Compare 3.0-3.5% thresholds

**Resolution Source:** Both use BLS CPI reports - TRUE OVERLAP ✓

---

### 6. US RECESSION BEFORE 2027

| Platform | Market | Current Odds |
|----------|--------|--------------|
| **Kalshi** | Recession before 2027? | ~31% YES |
| **Polymarket** | US recession in 2025/2026? | Variable by year |

**Note:** May have different recession definitions - check resolution criteria carefully

---

## CATEGORY 2: FREQUENCY-MATCHED OPPORTUNITIES

These are NOT identical markets, but their resolution timing creates synthetic hedges.

### DAILY → WEEKLY MATCHING (Same Platform)

Since Kalshi only has BTC/ETH, frequency matching for altcoins only works WITHIN Polymarket:

**Polymarket Internal Matching:**

| Daily Market | Weekly Market | Monthly Market | Strategy |
|--------------|---------------|----------------|----------|
| XRP up Nov 27 | XRP above $2.00 Nov 30 | XRP range Dec 2025 | Chain daily → weekly |
| SOL up Nov 28 | SOL above $130 Dec 1 | N/A | Use Friday daily for weekend weekly |
| BTC above $X Nov 28 | BTC price range Nov 24-30 | BTC high December | Friday drives weekly close |

**Example Frequency Chain (XRP):**
1. **Daily (Fri Nov 28):** XRP up/down → establishes momentum
2. **Weekly (Nov 30):** XRP above $2.00 (91%) / above $2.20 (54%) → if daily bullish, weekly compounds
3. **Monthly (Dec):** XRP range targets → weekly feeds into monthly positioning

### CROSS-PLATFORM Frequency Matching (Limited to BTC/ETH)

| Kalshi Daily | Polymarket Weekly | Note |
|--------------|-------------------|------|
| BTC range at 9PM ET Nov 28 | BTC price range Nov 29 at 12PM | 15-hour gap - NOT clean match |
| ETH above $X at 9PM ET | ETH weekly end Sunday | Weekend volatility risk |

**WARNING:** Kalshi resolves at 9PM ET, Polymarket typically at 12PM ET (noon). This time gap creates risk, not arbitrage.

### WEEKLY → MONTHLY MATCHING

**Last Week of Month = Monthly Close:**

| Week Ending | Monthly Resolution | Linkage |
|-------------|-------------------|---------|
| Nov 30 (Sun) | November close markets | Week-ending price ≈ month-ending price |
| Dec 31 (Tue) | December close markets | Last day of year - direct match |

**December 2025 Key Dates:**
- Dec 9-10: FOMC meeting (Fed decision resolves)
- Dec 31: BTC yearly high resolves, monthly stock targets resolve

---

## CATEGORY 3: MARKETS ONLY ON ONE PLATFORM

### Polymarket Only (No Kalshi Equivalent):
- XRP weekly/monthly price ranges
- SOL weekly/monthly price ranges  
- DOGE price markets
- Most altcoin markets
- Specific crypto ETF flows

### Kalshi Only (No Polymarket Equivalent):
- Detailed weather (snow totals by city, rain inches)
- Specific economic data (jobs report ranges, treasury yield bands)
- Netflix top 10 weekly
- Billboard Hot 100 weekly
- Gas price thresholds
- Airport TSA throughput

---

## CATEGORY 4: KNOWN RESOLUTION DIFFERENCES ⚠️

These markets LOOK the same but resolve differently - **HIGH RISK for arb**

### Bitcoin Price Markets

| Factor | Kalshi | Polymarket |
|--------|--------|------------|
| **Resolution Source** | CF Benchmarks RTI (60-second average) | Binance BTCUSDT 1-min candle |
| **Time Zone** | ET | ET |
| **Wick vs Close** | Average of 60 readings | High/Low of candle |

**Risk Example:** If BTC wicks to $100,001 for 1 second:
- Polymarket "BTC above $100K" = YES (any wick counts)
- Kalshi "BTC above $100K" = NO (60-second average may still be below)

### National Bitcoin Reserve

| Factor | Kalshi | Polymarket |
|--------|--------|------------|
| **Resolution Source** | NYT or White House only | "Consensus of credible reporting" + UMA oracle |
| **Criteria** | Official announcement | Government holding BTC |

**Historical Precedent:** 2024 government shutdown - Polymarket resolved YES, Kalshi resolved NO for same event.

---

## ACTIONABLE ARB CHECKLIST

### Step 1: Find Matching Markets
□ Same underlying event
□ Same resolution date
□ Same resolution source (or equivalent)
□ Same outcome definition

### Step 2: Calculate Spread
```
Arb Profit = $1 - (Platform A YES + Platform B NO)

Example:
Kalshi Fed cut YES = $0.85
Polymarket Fed hold (NO cut) YES = $0.14
Total = $0.99
Arb Profit = $1.00 - $0.99 = $0.01 (1%)

If spread > 3% → Execute
If spread > 5% → Strong execute
```

### Step 3: Account for Costs
- Kalshi: 1-2¢ per contract fee
- Polymarket: Gas fees (minimal on Polygon)
- Capital lockup cost (opportunity cost until resolution)
- Withdrawal/conversion costs

### Step 4: Execution
1. Buy YES on cheaper platform
2. Buy NO on expensive platform  
3. Wait for resolution
4. Collect $1 guaranteed payout minus fees

---

## REAL-TIME MONITORING TOOLS

1. **Polymarket Analytics** - https://polymarketanalytics.com
   - Cross-platform comparison
   - Real-time price feeds

2. **Google Finance** (coming soon)
   - Will show both Kalshi and Polymarket odds
   - Natural language queries

3. **Manual Check**
   - Kalshi: https://kalshi.com/markets
   - Polymarket: https://polymarket.com

---

## CURRENT BEST ARB OPPORTUNITIES (As of Nov 26, 2025)

### #1: Fed December Decision
- **Both platforms at ~84-85% cut probability**
- **Check for 1-2% divergence opportunities**
- **High liquidity, low execution risk**

### #2: Bitcoin $150K by EOY
- **Kalshi ~58% (as of May data, needs refresh)**
- **Polymarket variable**
- **CAUTION: Resolution source mismatch**

### #3: CPI Inflation Thresholds
- **Same BLS resolution source**
- **Compare 3.0% threshold pricing**
- **Medium liquidity**

---

## FREQUENCY MATCHING SUMMARY TABLE

| Daily (ends) | Weekly (covers) | Monthly (covers) | Arb Type |
|--------------|-----------------|------------------|----------|
| Fri Nov 28 | Nov 24-30 | November | D→W→M chain |
| Fri Dec 5 | Dec 1-7 | December | D→W connection |
| Tue Dec 31 | Dec 29-Jan 4 | December + January | Year-end crossover |

---

## KEY TAKEAWAYS

### The Hard Truth About Cross-Platform Arbitrage

1. **Altcoin arb is IMPOSSIBLE** - Kalshi only has BTC/ETH; Polymarket has XRP, SOL, DOGE but no Kalshi equivalent
2. **Stock arb is IMPOSSIBLE** - Polymarket has TSLA, AAPL, NVDA monthly targets; Kalshi has none
3. **Fed/CPI is your BEST opportunity** - Same resolution source (FOMC/BLS) on both platforms
4. **Bitcoin arb is RISKY** - Different price feeds (CFB RTI vs Binance) can cause split resolutions
5. **Frequency matching is for correlation, not arb** - Use daily→weekly patterns for directional conviction, not guaranteed profit

### Realistic Arbitrage Opportunities

| Type | Feasibility | Expected Spread | Notes |
|------|-------------|-----------------|-------|
| Fed Decision | HIGH | 1-3% | Same resolution source |
| CPI Thresholds | MEDIUM | 2-4% | Same BLS source |
| Bitcoin $150K+ | LOW | Variable | Resolution source mismatch risk |
| Number of Rate Cuts | MEDIUM | 1-3% | Same source, different structures |

### What You Should Actually Do

1. **Monitor Fed December decision** on both platforms for 3%+ divergence
2. **Check CPI threshold pricing** (3.0%, 3.5%) on both platforms monthly
3. **DON'T rely on Bitcoin arbitrage** - resolution source mismatch can cause total loss
4. **Use frequency matching within Polymarket** to chain daily→weekly→monthly altcoin plays
5. **Set up alerts** on polymarketanalytics.com for cross-platform price tracking

---

## NEXT STEPS

1. Set up price alerts on both platforms for Fed and CPI markets
2. Monitor Fed decision market for 3%+ divergence daily
3. Build spreadsheet tracking: Kalshi YES + Polymarket NO for matching markets
4. Focus on macro events (Fed, CPI) rather than crypto price arbs
5. Use Polymarket altcoin frequency chains for directional trades (not arbitrage)
