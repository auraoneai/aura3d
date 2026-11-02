#!/usr/bin/env node
// Usage: node tools/site/compose-gu47-posters.mjs <frame-pairs.json>
// JSON: [{ "slug": "<live-slug>", "before": "<frame-path>", "after": "<frame-path>" }, ...]
// Include all 25 live slugs. Relative frame paths are relative to the JSON file.
// Prefix metadata `frames` entries with their decoder output directory, not `meta/`.
// Choose verified final frames after freeze; this script does not assess freshness or approval.
import { lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const width = 1280;
const height = 720;
const labelHeight = 56;
const background = "#14181d";

// Fixed Graphik Medium Web outlines keep the labels portable without a runtime font lookup.
const beforeLabel = [
  "M82 715H338Q449 715 510.5 671.0Q572 627 572 529V525Q572 471 546.0 431.5Q520 392 459 373Q532 357 567.0 316.5Q602 276 602 204V200Q602 100 538.5 50.0Q475 0 357 0H82ZM341 95Q408 95 439.5 124.0Q471 153 471 209V213Q471 269 438.5 296.5Q406 324 332 324H212V95ZM322 414Q388 414 416.0 439.0Q444 464 444 519V523Q444 574 414.0 597.0Q384 620 320 620H212V414Z",
  "M947 -10Q889 -10 840.5 8.5Q792 27 756.5 61.5Q721 96 701.5 145.0Q682 194 682 256V264Q682 325 701.5 374.5Q721 424 756.0 459.5Q791 495 838.5 514.5Q886 534 942 534Q991 534 1035.5 519.0Q1080 504 1114.0 472.0Q1148 440 1168.5 390.0Q1189 340 1189 270V235H806Q809 160 845.5 120.0Q882 80 950 80Q1005 80 1034.0 101.0Q1063 122 1070 160H1187Q1174 77 1111.0 33.5Q1048 -10 947 -10ZM1069 316Q1064 384 1031.5 415.0Q999 446 942 446Q887 446 852.0 411.5Q817 377 808 316Z",
  "M1318 432H1247V523H1318V593Q1318 680 1363.5 725.0Q1409 770 1494 770Q1516 770 1531.0 767.5Q1546 765 1563 760V666Q1552 670 1538.5 672.5Q1525 675 1508 675Q1471 675 1455.0 653.5Q1439 632 1439 598V523H1558V432H1439V0H1318Z",
  "M1893 84Q1961 84 1999.0 130.5Q2037 177 2037 258V265Q2037 346 1999.0 392.5Q1961 439 1893 439Q1825 439 1786.5 393.0Q1748 347 1748 266V258Q1748 177 1786.0 130.5Q1824 84 1893 84ZM1892 -10Q1834 -10 1785.0 9.0Q1736 28 1700.0 63.0Q1664 98 1644.0 147.0Q1624 196 1624 256V264Q1624 325 1644.5 374.5Q1665 424 1701.0 459.5Q1737 495 1786.0 514.5Q1835 534 1893 534Q1950 534 1999.0 515.0Q2048 496 2084.0 460.5Q2120 425 2140.5 376.0Q2161 327 2161 267V259Q2161 198 2140.5 148.5Q2120 99 2084.0 63.5Q2048 28 1999.0 9.0Q1950 -10 1892 -10Z",
  "M2270 523H2391V425Q2416 475 2455.5 502.5Q2495 530 2561 531V418Q2521 418 2489.5 410.5Q2458 403 2436.0 386.0Q2414 369 2402.5 341.5Q2391 314 2391 272V0H2270Z",
  "M2897 -10Q2839 -10 2790.5 8.5Q2742 27 2706.5 61.5Q2671 96 2651.5 145.0Q2632 194 2632 256V264Q2632 325 2651.5 374.5Q2671 424 2706.0 459.5Q2741 495 2788.5 514.5Q2836 534 2892 534Q2941 534 2985.5 519.0Q3030 504 3064.0 472.0Q3098 440 3118.5 390.0Q3139 340 3139 270V235H2756Q2759 160 2795.5 120.0Q2832 80 2900 80Q2955 80 2984.0 101.0Q3013 122 3020 160H3137Q3124 77 3061.0 33.5Q2998 -10 2897 -10ZM3019 316Q3014 384 2981.5 415.0Q2949 446 2892 446Q2837 446 2802.0 411.5Q2767 377 2758 316Z"
].join("");
const afterLabel = [
  "M266 715H440L676 0H538L481 177H208L152 0H27ZM239 274H450L345 606Z",
  "M796 432H725V523H796V593Q796 680 841.5 725.0Q887 770 972 770Q994 770 1009.0 767.5Q1024 765 1041 760V666Q1030 670 1016.5 672.5Q1003 675 986 675Q949 675 933.0 653.5Q917 632 917 598V523H1036V432H917V0H796Z",
  "M1315 -9Q1237 -9 1197.0 31.0Q1157 71 1157 146V432H1087V523H1157V638H1278V523H1393V432H1278V157Q1278 122 1293.5 106.0Q1309 90 1338 90Q1373 90 1397 100V4Q1383 -1 1363.0 -5.0Q1343 -9 1315 -9Z",
  "M1736 -10Q1678 -10 1629.5 8.5Q1581 27 1545.5 61.5Q1510 96 1490.5 145.0Q1471 194 1471 256V264Q1471 325 1490.5 374.5Q1510 424 1545.0 459.5Q1580 495 1627.5 514.5Q1675 534 1731 534Q1780 534 1824.5 519.0Q1869 504 1903.0 472.0Q1937 440 1957.5 390.0Q1978 340 1978 270V235H1595Q1598 160 1634.5 120.0Q1671 80 1739 80Q1794 80 1823.0 101.0Q1852 122 1859 160H1976Q1963 77 1900.0 33.5Q1837 -10 1736 -10ZM1858 316Q1853 384 1820.5 415.0Q1788 446 1731 446Q1676 446 1641.0 411.5Q1606 377 1597 316Z",
  "M2086 523H2207V425Q2232 475 2271.5 502.5Q2311 530 2377 531V418Q2337 418 2305.5 410.5Q2274 403 2252.0 386.0Q2230 369 2218.5 341.5Q2207 314 2207 272V0H2086Z"
].join("");
const labels = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${labelHeight}">` +
  `<g fill="#f7f7f7" transform="translate(24 42) scale(.04 -.04)"><path d="${beforeLabel}"/></g>` +
  `<g fill="#f7f7f7" transform="translate(${width + 24} 42) scale(.04 -.04)"><path d="${afterLabel}"/></g>` +
  `</svg>`
);

function refuseExisting(file) {
  try {
    lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing poster: ${file}`);
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error("Usage: node tools/site/compose-gu47-posters.mjs <frame-pairs.json>");
  }
  const listFile = resolve(process.argv[2]);
  const inventory = JSON.parse(readFileSync(join(root, "docs/workflows/game-inventory.json"), "utf8"));
  const live = Array.isArray(inventory.games)
    ? inventory.games.filter((game) => game?.status === "live").map((game) => game.slug)
    : [];
  const liveSet = new Set(live);
  if (live.length !== 25 || liveSet.size !== 25 || live.some((slug) => typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    throw new Error("Inventory must contain exactly 25 unique, valid live slugs");
  }

  const list = JSON.parse(readFileSync(listFile, "utf8"));
  if (!Array.isArray(list) || list.length !== 25) {
    throw new Error("Frame list must contain exactly 25 live-slug entries");
  }
  const seen = new Set();
  const pairs = list.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !liveSet.has(entry.slug)) {
      throw new Error(`Unknown or invalid live slug: ${entry?.slug}`);
    }
    if (seen.has(entry.slug)) throw new Error(`Duplicate live slug: ${entry.slug}`);
    seen.add(entry.slug);
    if (typeof entry.before !== "string" || !entry.before.trim() || typeof entry.after !== "string" || !entry.after.trim()) {
      throw new Error(`${entry.slug}: supply explicit before and after frame paths`);
    }
    return {
      slug: entry.slug,
      before: resolve(dirname(listFile), entry.before),
      after: resolve(dirname(listFile), entry.after),
      output: join(root, "evidence/game-upgrades-47", entry.slug, "poster-before-after.jpg")
    };
  });

  for (const pair of pairs) {
    for (const side of ["before", "after"]) {
      if (!statSync(pair[side]).isFile()) throw new Error(`${pair.slug}: ${side} is not a file: ${pair[side]}`);
    }
    refuseExisting(pair.output);
  }

  const posters = [];
  for (const pair of pairs) {
    const panels = await Promise.all([pair.before, pair.after].map((file) =>
      sharp(file).rotate().resize(width, height, { fit: "contain", background }).png().toBuffer()
    ));
    const image = await sharp({ create: { width: width * 2, height: height + labelHeight, channels: 3, background } })
      .composite([
        { input: labels, left: 0, top: 0 },
        { input: panels[0], left: 0, top: labelHeight },
        { input: panels[1], left: width, top: labelHeight }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
    posters.push({ output: pair.output, image });
  }

  for (const poster of posters) {
    mkdirSync(dirname(poster.output), { recursive: true });
    writeFileSync(poster.output, poster.image, { flag: "wx" });
  }
  console.log(`Wrote ${posters.length} before/after posters.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
