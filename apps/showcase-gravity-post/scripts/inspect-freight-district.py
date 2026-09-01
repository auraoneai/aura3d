#!/usr/bin/env python3
"""Inspect the route-local freight-district candidate through Blender."""

from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector


APP_DIR = Path(__file__).resolve().parent.parent
ASSET = APP_DIR / "assets" / "candidates" / "gravityPostFreightDistrict.candidate.glb"


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSET))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = [min(point[axis] for point in corners) for axis in range(3)]
maximum = [max(point[axis] for point in corners) for axis in range(3)]
dimensions = [maximum[axis] - minimum[axis] for axis in range(3)]
triangles = 0
vertices = 0
primitives = 0
for obj in meshes:
    mesh = obj.data
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    vertices += len(mesh.vertices)
    primitives += max(1, len(mesh.materials))

report = {
    "asset": str(ASSET),
    "blender": bpy.app.version_string,
    "nodes": len(list(bpy.context.scene.objects)),
    "meshNodes": len(meshes),
    "materials": len(bpy.data.materials),
    "estimatedDrawSubmissions": primitives,
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
print("FREIGHT_DISTRICT_INSPECT=" + json.dumps(report, separators=(",", ":")))
