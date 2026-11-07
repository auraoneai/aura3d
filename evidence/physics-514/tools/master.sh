#!/bin/bash
# All remaining captures, one after another (each capture takes /tmp/a3d-rea.lock only while it runs).
O=/tmp/fx517-phys2
C=$O/consumer
CF=$O/consumer-frames
node $O/tools/ccap.mjs $C/branch/dist-nophys-notla-present $CF/branch-nophys-notla-present.png "" 8000
node $O/tools/ccap.mjs $C/published/dist-nophys-present $CF/published-nophys-present.png "" 8000
node $O/tools/ccap.mjs $C/published/dist-phys-absent $CF/published-phys-absent.png "" 8000
bash $O/tools/capture-all.sh branch a showcase-bunker-zero showcase-roadster-rush showcase-teleoperator > $O/cap-branch-a2.log 2>&1
bash $O/tools/capture-all.sh base a showcase-bank-shot showcase-slingshot-siege showcase-aurora-lander showcase-blockfall-reactor showcase-bunker-zero showcase-roadster-rush showcase-teleoperator showcase-vault-breakers showcase-cross-hop > $O/cap-base-a.log 2>&1
bash $O/tools/capture-all.sh base b > $O/cap-base-b.log 2>&1
for run in a b; do
  for v in base branch; do
    node $O/tools/ccap.mjs $O/$v/recipe $O/frames/$v-recipe16-$run.png "steps=140" 9000
  done
done
echo done > $O/master.done
