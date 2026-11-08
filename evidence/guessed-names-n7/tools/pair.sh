#!/bin/bash
# per route: single-route marketing build, serve on 10661, capture local (10662) and live (10663)
cd /Users/gurbakshchahal/platforms/aura3d-u-n7-names
OUT=/tmp/n7names/frames; mkdir -p $OUT
for slug in "$@"; do
  if [ "$slug" != "showcase-teleoperator" ] || [ ! -d marketing/dist/apps/$slug ]; then
    (cd marketing && AURA3D_ONLY_ROUTE=$slug pnpm build > /tmp/n7names/mk-$slug.log 2>&1)
  fi
  [ -d marketing/dist/apps/$slug ] || { echo "$slug BUILD-MISSING"; continue; }
  python3 -m http.server 10661 --bind 127.0.0.1 -d marketing/dist > /dev/null 2>&1 &
  SRV=$!
  sleep 2
  mkdir -p $OUT/local $OUT/live
  node /tmp/n7tools/census.mjs "http://127.0.0.1:10661/apps/$slug/" $slug $OUT/local 10662
  node /tmp/n7tools/census.mjs "https://aura3d.auraone.ai/apps/$slug/" $slug $OUT/live 10663
  kill $SRV
done
echo DONE
