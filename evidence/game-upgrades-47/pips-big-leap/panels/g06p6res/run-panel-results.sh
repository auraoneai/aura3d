#!/bin/bash
# Blind 3-judge panel as independent headless Claude processes (restart-proof).
# Usage: run-panel.sh <after_dir relative to /Users/gurbakshchahal/platforms/aura3d-gu47> <slug,slug,...> <tag>
# Writes /tmp/gu47-judge/out/<tag>/<slug>-j<j>.txt and prints the tally (also /tmp/gu47-judge/out/<tag>/verdicts.json).
set -u
AFTER_DIR=$1; SLUGS=$2; TAG=$3; export JUDGE_ARGS=/tmp/gu47-judge/args-$TAG.json
CLAUDE=/Users/gurbakshchahal/.local/bin/claude
OUT=/tmp/gu47-judge/out/$TAG
mkdir -p "$OUT"
cd /Users/gurbakshchahal/platforms/aura3d-gu47 || exit 2
true  # custom args (results screens)
python3 -I /tmp/gu47-blind-copy.py > "$OUT/small.json" 2>> "$OUT/args.log"
node -e '
const fs=require("fs"); const small=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
for (const g of small) for (let j=0;j<3;j++) {
  const dir=`/tmp/gu47-judge/${g.slug}/j${j}`;
  const lines=g.variants.map(v=>`- variant "${v.variant}"${v.isNew?" (exists in only one build: the other image is that build default scene)":""}: A = ${dir}/${v.variant}-A.jpg , B = ${dir}/${v.variant}-B.jpg`).join("\n");
  const p=`You are an independent art director judging screenshots of a browser 3D game ("${g.slug}"), rendered in software WebGL2: its end-of-level results screen (the results panel over the blurred game scene; results-1280 is 1280x720, results-390 is a 390x844 phone). For each variant below there are two screenshots, A and B, from two different builds of the same game; you are not told which build is which, and the order changes from variant to variant. Open EVERY image with the Read tool and look at it carefully before judging.\n\n${lines}\n\nFor each variant decide which image is the better-looking game frame overall: lighting and mood, readability of the player/subject and play area, colour and contrast, atmosphere and depth, material detail, composition, polish. Penalise heavily: black or blank frames, frames washed out by haze or fog, a missing or hidden player, broken geometry, the camera inside geometry, floating objects, glitches, muddy low-contrast images. Answer "same" only when neither is clearly better. Be strict and honest.\n\nYour final reply must be ONLY one JSON object, no prose, no code fence: {"variants":[{"variant":"<name exactly as given>","better":"A"|"B"|"same","brokenA":true|false,"brokenB":true|false,"defectsA":"...","defectsB":"..."}]}`;
  fs.writeFileSync(`'"$OUT"'/${g.slug}-j${j}.prompt`, p);
}' "$OUT/small.json"
pids=()
for f in "$OUT"/*.prompt; do
  b=$(basename "$f" .prompt)
  ( "$CLAUDE" -p "$(cat "$f")" --model acct/claude-opus-5.5 --dangerously-skip-permissions --strict-mcp-config \
      --mcp-config /tmp/gu47-lanes/empty-mcp.json --output-format text < /dev/null > "$OUT/$b.txt" 2>&1 ) &
  pids+=($!)
  sleep 2
done
wait "${pids[@]}"
node /tmp/gu47-judge/tally.mjs "$OUT"
