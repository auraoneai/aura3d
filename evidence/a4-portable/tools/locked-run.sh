#!/bin/bash
# Serialize real-GPU captures across lanes (REA lock), run the harness, always release.
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 0.5; done
trap 'rmdir /tmp/a3d-rea.lock 2>/dev/null' EXIT INT TERM
cd "$(dirname "$0")/../../.."
timeout 1500 node evidence/a4-portable/tools/run.mjs "$@"
