#!/bin/bash
# usage: locked.sh <log> <cmd...>  — runs cmd from the lane worktree under /tmp/a3d-build.lock with nice 10
LOG=$1; shift
cd /Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1 || exit 1
until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
trap 'rmdir /tmp/a3d-build.lock 2>/dev/null' EXIT INT TERM
nice -n 10 "$@" > "$LOG" 2>&1
echo "exit $?" >> "$LOG"
