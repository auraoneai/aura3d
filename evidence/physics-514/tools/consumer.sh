#!/bin/bash
# Clean consumer: the published 5.0.2 npm dependency tree (node_modules from `npm install` of the 5.0.2 engine tarball + vite) with
# @aura3d/engine replaced by (a) the published 5.0.2 tarball or (b) the tarball packed from this branch build.
# Builds a no-physics app (src/) and a physics app (phys/, recipe 16 source) with the Rapier backend present and absent;
# for the branch also the no-physics app under the `aura3d-no-tla` condition. Serialized under /tmp/a3d-build.lock.
set -u
C=/tmp/fx517-phys2/consumer
SRC=/tmp/physics-clean
BRANCH_TGZ=$1
PUB_TGZ=/tmp/fx517-phys-pub/aura3d-engine-5.0.2.tgz
build() { # dir label args...
  local D=$1 L=$2; shift 2
  until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
  (cd $D && nice -n 10 node_modules/.bin/vite build "$@" > build-$L.log 2>&1; echo "exit $?" >> build-$L.log)
  rmdir /tmp/a3d-build.lock
}
for V in branch published; do
  D=$C/$V
  rm -rf $D; mkdir -p $D
  cp -R $SRC/src $SRC/phys $SRC/index.html $SRC/package.json $D/
  cp -R $SRC/node_modules $D/node_modules
  rm -rf $D/node_modules/@aura3d/engine; mkdir -p $D/node_modules/@aura3d/engine
  if [ $V = branch ]; then TGZ=$BRANCH_TGZ; else TGZ=$PUB_TGZ; fi
  tar xzf $TGZ -C $D/node_modules/@aura3d/engine --strip-components=1
  shasum $TGZ > $D/engine-tarball.sha1
  cat > $D/vite.notla.config.js <<'EOF'
import { defaultClientConditions } from "vite";
export default { resolve: { conditions: ["aura3d-no-tla", ...defaultClientConditions] } };
EOF
  for MODE in present absent; do
    if [ $MODE = absent ]; then mv $D/node_modules/@dimforge $D/node_modules/.dimforge-away; fi
    build $D nophys-$MODE --outDir dist-nophys-$MODE --emptyOutDir
    build $D phys-$MODE phys --outDir ../dist-phys-$MODE --emptyOutDir
    if [ $V = branch ] && [ $MODE = present ]; then build $D nophys-notla-present -c vite.notla.config.js --outDir dist-nophys-notla-present --emptyOutDir; fi
    if [ $MODE = absent ]; then mv $D/node_modules/.dimforge-away $D/node_modules/@dimforge; fi
  done
done
echo done > $C.done
