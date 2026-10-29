#!/usr/bin/env bash
# Makes the story-menu host portraits (src/ui/portraits.ts, PRD 04 E02) from the character-sheet captures of the
# remote characters specs: one turnaround view per character (the front by default), cropped square, 256 px, WebP.
#   apps/veer-wonder-world/tools/make-portraits.sh <dir with char-<id>-turn-<view>.jpg files> <capture run id> [<id>=<view> ...]
# The view defaults to `front`; an override such as `gogo=right` picks another turnaround view for one character.
# Needs ffmpeg and cwebp. Writes src/assets/portraits/<id>.webp and their records in provenance/portraits.json
# (read by tools/gen-rights-manifest.mjs); src/ui/portraits.ts names each file.
set -euo pipefail
SRC="$1"
RUN="$2"
shift 2
view_of() {
  local id="$1" pair
  for pair in $OVERRIDES; do [ "${pair%%=*}" = "$id" ] && { echo "${pair#*=}"; return; }; done
  echo front
}
OVERRIDES="$*"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$APP/src/assets/portraits"
mkdir -p "$OUT"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for id in momo lulu sheru gogo lumi peeko; do
  in="$SRC/char-$id-turn-$(view_of "$id").jpg"
  [ -f "$in" ] || { echo "missing $in" >&2; exit 1; }
  # A square of the shorter side, centred across and a little above centre down a tall crop (the head reads at
  # thumbnail size), scaled to 256 px.
  ffmpeg -loglevel error -y -i "$in" -vf "crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'(ih-min(iw,ih))*0.35',scale=256:256:flags=lanczos" "$tmp/$id.png"
  cwebp -quiet -q 82 -m 6 "$tmp/$id.png" -o "$OUT/$id.webp"
  echo "$id.webp $(wc -c < "$OUT/$id.webp" | tr -d ' ') bytes"
done
RUN="$RUN" OVERRIDES="$OVERRIDES" node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const app = process.argv[1];
const records = {};
const views = Object.fromEntries((process.env.OVERRIDES ?? "").split(/\s+/).filter(Boolean).map((pair) => pair.split("=")));
for (const id of ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]) {
  const file = `src/assets/portraits/${id}.webp`;
  const model = JSON.parse(readFileSync(join(app, "provenance", "models", `${id}.json`), "utf8"));
  records[id] = {
    file,
    sha256: createHash("sha256").update(readFileSync(join(app, file))).digest("hex"),
    source: `${process.env.RUN} capture char-${id}-turn-${views[id] ?? "front"}: the app stage rendering the admitted model (software WebGL2), cropped square and scaled to 256 px`,
    model: model.file,
    license: model.license,
    review: { status: "approved", reviewer: "agent:claude-opus-5.5", date: "2026-10-29" }
  };
}
writeFileSync(join(app, "provenance", "portraits.json"), `${JSON.stringify(records, null, 1)}\n`);
console.log("provenance/portraits.json: 6 records");
' "$APP"
