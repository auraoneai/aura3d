#!/usr/bin/env python3
"""Inspect Turbo Drift's route-local circuit-environment candidate."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector


APP_DIR = Path(__file__).resolve().parent.parent
ASSET = APP_DIR / "assets" / "candidates" / "turboCircuitEnvironmentV2.candidate.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSET))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = [min(point[axis] for point in corners) for axis in range(3)]
maximum = [max(point[axis] for point in corners) for axis in range(3)]
dimensions = [maximum[axis] - minimum[axis] for axis in range(3)]
triangles = 0
vertices = 0
draws = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
    vertices += len(obj.data.vertices)
    draws += max(1, len(obj.data.materials))

report = {
    "asset": str(ASSET),
    "sha256": hashlib.sha256(ASSET.read_bytes()).hexdigest(),
    "bytes": ASSET.stat().st_size,
    "blender": bpy.app.version_string,
    "nodes": len(list(bpy.context.scene.objects)),
    "meshNodes": len(meshes),
    "materials": len(bpy.data.materials),
    "estimatedDrawSubmissions": draws,
    "vertices": vertices,
    "triangles": triangles,
    "boundsBlenderXYZ": {
        "min": [round(value, 6) for value in minimum],
        "max": [round(value, 6) for value in maximum],
        "dimensions": [round(value, 6) for value in dimensions],
    },
    "boundsAuraXYZ": {
        "min": [round(minimum[0], 6), round(minimum[2], 6), round(-maximum[1], 6)],
        "max": [round(maximum[0], 6), round(maximum[2], 6), round(-minimum[1], 6)],
        "dimensions": [round(dimensions[0], 6), round(dimensions[2], 6), round(dimensions[1], 6)],
    },
    "meshNames": sorted(obj.name for obj in meshes),
    "materialNames": sorted(mat.name for mat in bpy.data.materials),
}
print("TURBO_CIRCUIT_ENVIRONMENT_V2_INSPECT=" + json.dumps(report, separators=(",", ":")))
