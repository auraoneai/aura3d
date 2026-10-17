#!/usr/bin/env bash
# tools/remote-capture.sh — run a browser capture of a built showcase route on
# the AuraOne remote EC2 runner (machine policy: no local browser automation).
#
# Usage:
#   tools/remote-capture.sh <route> <distDir> <outDir> [urlPath] [waitMs] [shots]
#
# Example:
#   tools/remote-capture.sh showcase-bunker-zero /tmp/dist-bunker-zero ./evidence/bunker-zero "/apps/showcase-bunker-zero/?demo=1" 8000 4
#
# Prerequisites: runner instance id in tools/remote-runner/INSTANCE_ID (written
# by the provision step), SSM agent online, capture-server.mjs running remotely.
# The script opens an SSM port-forwarding session on demand and reuses it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_BIN="${AWS_BIN:-$HOME/.local/bin/aws}"
REGION="${AWS_REGION:-us-west-2}"
INSTANCE_FILE="$REPO_ROOT/tools/remote-runner/INSTANCE_ID"
REMOTE_PORT="${CAPTURE_REMOTE_PORT:-8099}"

# Prefer a forward that is already healthy (shared by concurrent runs); else
# pick the first free port and open a new SSM session.
health_on() { curl -fsS --max-time 4 "http://127.0.0.1:$1/health" >/dev/null 2>&1; }
pick_local_port() {
  for p in 18099 18100 18101 18102 18103 18104 18105; do
    health_on "$p" && { echo "$p"; return 0; }
  done
  for p in 18099 18100 18101 18102 18103 18104 18105; do
    if ! nc -z 127.0.0.1 "$p" 2>/dev/null && ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$p"; return 0
    fi
  done
  echo 18099
}
LOCAL_PORT="${CAPTURE_LOCAL_PORT:-$(pick_local_port)}"
FWD_PID_FILE="/tmp/aura3d-ssm-fwd-${LOCAL_PORT}.pid"
FWD_LOG="/tmp/aura3d-ssm-fwd-${LOCAL_PORT}.log"

ROUTE="${1:-}"
DIST_DIR="${2:-}"
OUT_DIR="${3:-}"
URL_PATH="${4:-/apps/${1:-}/}"
WAIT_MS="${5:-7000}"
SHOTS="${6:-4}"

if [[ -z "$ROUTE" || -z "$DIST_DIR" || -z "$OUT_DIR" ]]; then
  echo "usage: tools/remote-capture.sh <route> <distDir> <outDir> [urlPath] [waitMs] [shots]" >&2
  exit 2
fi
if [[ ! -f "$INSTANCE_FILE" ]]; then
  echo "remote-capture: runner not provisioned ($INSTANCE_FILE missing)" >&2
  exit 3
fi
INSTANCE_ID="$(tr -d '[:space:]' < "$INSTANCE_FILE")"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "remote-capture: dist dir missing: $DIST_DIR (build with: node tools/dev-route-build.mjs $ROUTE <distDir>)" >&2
  exit 2
fi
mkdir -p "$OUT_DIR"

health() {
  health_on "$LOCAL_PORT"
}

ensure_forward() {
  if health; then return 0; fi
  # clean stale pid
  if [[ -f "$FWD_PID_FILE" ]] && ! kill -0 "$(cat "$FWD_PID_FILE")" 2>/dev/null; then rm -f "$FWD_PID_FILE"; fi
  echo "remote-capture: opening SSM port-forward to $INSTANCE_ID :$REMOTE_PORT" >&2
  nohup "$AWS_BIN" ssm start-session --region "$REGION" --target "$INSTANCE_ID" \
    --document-name AWS-StartPortForwardingSession \
    --parameters "{\"portNumber\":[\"$REMOTE_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
    >"$FWD_LOG" 2>&1 &
  echo $! > "$FWD_PID_FILE"
  for _ in $(seq 1 30); do
    sleep 1
    if health; then return 0; fi
  done
  echo "remote-capture: SSM forward did not come up; log:" >&2
  tail -20 "$FWD_LOG" >&2 || true
  exit 3
}

# --- assemble serve tree -----------------------------------------------------
WORK_TMP="$(mktemp -d /tmp/aura3d-capture-XXXXXX)"
trap 'rm -rf "$WORK_TMP"' EXIT
SERVE="$WORK_TMP/serve"
mkdir -p "$SERVE/apps/$ROUTE" "$SERVE/aura-assets"
# Bundles are built with base "/" and referenced as /assets/index-*.js — lay
# the dist out like marketing/dist: shared /assets at root, route entry at
# /apps/<route>/index.html.
cp -R "$DIST_DIR"/. "$SERVE/"
rm -f "$SERVE/assets"/*.map 2>/dev/null || true
# The vite publicDir copies the whole repo public/ into every dist — that
# drags in other routes' payloads (packs/, previews/, toptennis-v2/…). Keep
# only what any route can actually request: bundles, decoders, environments,
# hdri, fonts, favicon. Route-local public dirs are re-added below.
for entry in "$SERVE"/*; do
  case "$(basename "$entry")" in
    index.html|assets|aura-assets|aura-decoders|aura-environments|hdri|fonts|favicon.svg|apps) ;;
    *) rm -rf "$entry" ;;
  esac
done
for app_entry in "$SERVE/apps"/*; do
  [[ "$(basename "$app_entry")" == "$ROUTE" ]] || rm -rf "$app_entry"
done
# dev-route-build emits the route html at apps/<route>/index.html already;
# a flat dist (index.html at root) also works — normalize it into place only when apps/<route>/index.html is absent.
if [[ ! -f "$SERVE/apps/$ROUTE/index.html" && -f "$DIST_DIR/index.html" ]]; then
  cp "$DIST_DIR/index.html" "$SERVE/apps/$ROUTE/index.html"
fi
[[ -f "$SERVE/apps/$ROUTE/index.html" ]] || { echo "remote-capture: no route index.html found in $DIST_DIR" >&2; exit 2; }
[[ -f "$REPO_ROOT/apps/$ROUTE/route-health.json" ]] && cp "$REPO_ROOT/apps/$ROUTE/route-health.json" "$SERVE/apps/$ROUTE/route-health.json" || true

# dev-route-build sets publicDir:false, so shared runtime payloads the engine
# fetches by absolute path (/hdri/*.hdr, /fonts/*, /aura-decoders/*,
# /aura-environments/*) never reach the dist. Supply them from repo public/
# whenever the dist did not already provide them (~23MB total).
PUBLIC_ROOT="$REPO_ROOT/public"
for shared in hdri fonts aura-decoders aura-environments probes; do
  if [[ ! -d "$SERVE/$shared" && -d "$PUBLIC_ROOT/$shared" ]]; then
    cp -R "$PUBLIC_ROOT/$shared" "$SERVE/$shared"
  fi
done
if grep -rq "/packs/" "$REPO_ROOT/apps/$ROUTE/src" 2>/dev/null && [[ -d "$PUBLIC_ROOT/packs" ]]; then
  cp -R "$PUBLIC_ROOT/packs" "$SERVE/packs"
fi
[[ -f "$SERVE/favicon.svg" ]] || cp "$PUBLIC_ROOT/favicon.svg" "$SERVE/favicon.svg" 2>/dev/null || true

# The vite publicDir copies the whole repo public/ into the dist root. Keep
# small dirs, and aura-assets (>1GB) re-copies only used files (below).
if [[ -d "$SERVE/aura-assets" ]]; then
  rm -rf "$SERVE/aura-assets"
  mkdir -p "$SERVE/aura-assets"
fi
if [[ -d "$PUBLIC_ROOT/aura-assets/Textures" ]]; then
  cp -R "$PUBLIC_ROOT/aura-assets/Textures" "$SERVE/aura-assets/Textures"
fi

# route-local public payloads (e.g. public/<slug>/, public/aura-assets/) are
# served at both /<name>/ and /apps/<route>/<name>/ like marketing/dist does.
APP_PUBLIC="$REPO_ROOT/apps/$ROUTE/public"
if [[ -d "$APP_PUBLIC" ]]; then
  for entry in "$APP_PUBLIC"/*; do
    [[ -d "$entry" ]] || continue
    if [[ "$(basename "$entry")" == "aura-assets" ]]; then
      cp -R "$entry"/. "$SERVE/aura-assets/"
    else
      cp -R "$entry" "$SERVE/$(basename "$entry")"
      cp -R "$entry" "$SERVE/apps/$ROUTE/$(basename "$entry")"
    fi
  done
fi

# aura-assets: resolve only the typed keys the app source actually imports
# (assets.<key>, v2assets.<key>, …) against the manifest url fields.
APP_SRC="$REPO_ROOT/apps/$ROUTE/src"
REFS_FILE="$WORK_TMP/asset-refs.txt"
: > "$REFS_FILE"
MANIFESTS="$REPO_ROOT/src/aura-assets.ts"
for mf in "$APP_SRC"/aura-assets*.ts; do
  [[ -f "$mf" ]] && MANIFESTS="$MANIFESTS $mf"
done
# shellcheck disable=SC2086
python3 - "$APP_SRC" $MANIFESTS > "$REFS_FILE" <<'PY'
import glob, os, re, sys
app_src = sys.argv[1]
manifests = [m for m in sys.argv[2:] if os.path.isfile(m)]
key_url = {}
for mf in manifests:
    src = open(mf, encoding="utf-8", errors="ignore").read()
    for m in re.finditer(r'(?:["\']([A-Za-z0-9_]+)["\']|(?<![A-Za-z0-9_])([A-Za-z0-9_]+))\s*:\s*\{', src):
        key = m.group(1) or m.group(2)
        if not key or key in key_url:
            continue
        depth, end = 0, len(src)
        for i in range(m.end() - 1, len(src)):
            if src[i] == '{':
                depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        u = re.search(r'url\s*:\s*["\']([^"\']+)["\']', src[m.start():end])
        if u:
            key_url[key] = u.group(1)
cands = set()
direct_urls = set()
for f in glob.glob(os.path.join(app_src, "**/*"), recursive=True):
    if not os.path.isfile(f):
        continue
    try:
        s = open(f, encoding="utf-8", errors="ignore").read()
    except OSError:
        continue
    cands.update(re.findall(r'[A-Za-z0-9_]*assets\.([A-Za-z0-9_]+)', s))
    cands.update(re.findall(r'["\']([A-Za-z0-9_]+)["\']', s))
    direct_urls.update(re.findall(r'(/aura-assets/[A-Za-z0-9._/-]+\.(?:glb|gltf|png|jpg|jpeg|webp|svg|ktx2|mp3|wav|ogg|m4a))', s))
urls_out = set(direct_urls)
for key in sorted(cands):
    u = key_url.get(key)
    if u and u.startswith("/"):
        urls_out.add(u)
for u in sorted(urls_out):
    print(u.lstrip("/"))
PY
while IFS= read -r ref; do
  [[ -n "$ref" && -f "$PUBLIC_ROOT/$ref" && ! -f "$SERVE/$ref" ]] || continue
  mkdir -p "$SERVE/$(dirname "$ref")" 2>/dev/null || true
  cp "$PUBLIC_ROOT/$ref" "$SERVE/$ref"
done < "$REFS_FILE"
# minimal index at root
cat > "$SERVE/index.html" <<'EOF'
<!doctype html><meta charset="utf-8"><title>aura3d capture root</title>
EOF

TARBALL="$WORK_TMP/payload.tar.gz"
tar -C "$SERVE" -czf "$TARBALL" .
PAYLOAD_BYTES=$(stat -f%z "$TARBALL" 2>/dev/null || stat -c%s "$TARBALL")

ensure_forward

echo "remote-capture: uploading $PAYLOAD_BYTES bytes for $ROUTE" >&2
curl -fsS --max-time 600 -T "$TARBALL" \
  "http://127.0.0.1:${LOCAL_PORT}/work/${ROUTE}" >/dev/null

echo "remote-capture: capturing $URL_PATH" >&2
curl -fsS --max-time 240 -X POST \
  "http://127.0.0.1:${LOCAL_PORT}/capture/${ROUTE}?url=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$URL_PATH")&waitMs=${WAIT_MS}&shots=${SHOTS}" \
  -o "$OUT_DIR/capture-result.json"

# pull artifacts
FILES=$(python3 -c "import json,sys;print(' '.join(f['name'] for f in json.load(open('$OUT_DIR/capture-result.json')).get('files',[])))" 2>/dev/null || true)
LIST_JSON=$(curl -fsS --max-time 30 "http://127.0.0.1:${LOCAL_PORT}/out/${ROUTE}" || echo '{"files":[]}')
for name in $(python3 -c "import json,sys;print(' '.join(f['name'] for f in json.loads(sys.argv[1]).get('files',[])))" "$LIST_JSON"); do
  curl -fsS --max-time 120 "http://127.0.0.1:${LOCAL_PORT}/out/${ROUTE}/${name}" -o "$OUT_DIR/$name" || echo "remote-capture: failed to fetch $name" >&2
done

echo "remote-capture: artifacts in $OUT_DIR" >&2
ls -la "$OUT_DIR" >&2
