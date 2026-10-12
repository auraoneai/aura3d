#!/bin/bash
# usage: get.sh RUNID -> prints out dir
d=/tmp/qrq/g/$1; mkdir -p $d; cd $d
[ -n "$(find . -name report.json -path '*games-track0*' | head -1)" ] || gh run download $1 -R auraoneai/aura3d -p "qr-gpu-games-*" >/dev/null 2>&1
dirname "$(find . -name report.json -path '*games-track0*' | head -1)" | sed "s#^\.#$d#"
