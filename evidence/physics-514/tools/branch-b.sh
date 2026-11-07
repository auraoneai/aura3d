#!/bin/bash
O=/tmp/fx517-phys2
until [ -f $O/master.done ]; do sleep 10; done
bash $O/tools/capture-all.sh branch b showcase-slingshot-siege showcase-bank-shot showcase-aurora-lander showcase-blockfall-reactor showcase-roadster-rush showcase-teleoperator > $O/cap-branch-b.log 2>&1
