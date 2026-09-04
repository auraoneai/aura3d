"""Create a ball-free contesting defender from the verified CC-BY source GLB.

This is a deterministic, route-local adaptation used only for visual review.
It preserves the source's disconnected-but-touching body pieces, rotates the two
complete arm islands at their shoulder seams, recolors uniform-like texels, and
exports a grounded 1.95 m GLB. No shared Aura manifest or runtime files are used.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "basketball-player.glb"
OUTPUT = HERE / "basketball-defender-derived.glb"
TEXTURE_PREVIEW = HERE / "defender-uniform-texture.png"


def connected_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    adjacent: list[set[int]] = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacent[a].add(b)
        adjacent[b].add(a)

    seen: set[int] = set()
    components: list[list[int]] = []
    for start in range(len(mesh.vertices)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            for neighbor in adjacent[index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


def rotate_arm_component(
    body: bpy.types.Object,
    component: list[int],
    angle_degrees: float,
) -> tuple[Vector, int]:
    world = body.matrix_world
    inverse = world.inverted()
    points = [world @ body.data.vertices[index].co for index in component]
    minimum_z = min(point.z for point in points)
    shoulder_points = [point for point in points if point.z < minimum_z + 4.0]
    pivot = sum(shoulder_points, Vector()) / len(shoulder_points)
    rotation = Matrix.Rotation(math.radians(angle_degrees), 4, "Y")
    for index in component:
        point = world @ body.data.vertices[index].co
        body.data.vertices[index].co = inverse @ (pivot + rotation @ (point - pivot))
    return pivot, len(component)


def recolor_uniform_texture() -> None:
    image = bpy.data.images.get("Image_0")
    if image is None:
        raise RuntimeError("Expected packed source texture Image_0")

    pixels = list(image.pixels)
    recolored_neutral = 0
    recolored_red = 0
    for offset in range(0, len(pixels), 4):
        red, green, blue, alpha = pixels[offset : offset + 4]
        if alpha <= 0.01:
            continue
        brightest = max(red, green, blue)
        darkest = min(red, green, blue)
        spread = brightest - darkest

        # White/neutral fabric becomes saturated teal-blue. Skin and hair are
        # chromatic enough to remain outside this gate.
        if brightest > 0.22 and spread < 0.075:
            luminance = (red + green + blue) / 3.0
            pixels[offset] = 0.018 + 0.035 * luminance
            pixels[offset + 1] = 0.18 + 0.38 * luminance
            pixels[offset + 2] = 0.32 + 0.52 * luminance
            recolored_neutral += 1
        # Red sock/uniform accents become gold. The condition is deliberately
        # strict so normal skin values do not move.
        elif red > 0.18 and red > green * 2.2 and red > blue * 2.0:
            strength = min(1.0, red * 1.35)
            pixels[offset] = 0.42 + 0.46 * strength
            pixels[offset + 1] = 0.16 + 0.30 * strength
            pixels[offset + 2] = 0.018
            recolored_red += 1

    image.pixels.foreach_set(pixels)
    image.update()
    image.filepath_raw = str(TEXTURE_PREVIEW)
    image.file_format = "PNG"
    image.save()
    # Load the written pixels as a new datablock. Repacking the already-packed
    # source image would retain its original payload even after pixel edits.
    defender_image = bpy.data.images.load(str(TEXTURE_PREVIEW), check_existing=False)
    defender_image.name = "DefenderUniform"
    defender_image.pack()
    for material in bpy.data.materials:
        if material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.bl_idname == "ShaderNodeTexImage" and node.image == image:
                node.image = defender_image
    print(
        "DEFENDER_TEXTURE",
        {"neutral_texels": recolored_neutral, "red_texels": recolored_red},
    )


def flatten_and_normalize(mesh_objects: list[bpy.types.Object]) -> None:
    # Bake every retained mesh to world space before discarding the imported
    # helper hierarchy. This keeps face/eye/teeth alignment exact.
    for obj in mesh_objects:
        world = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            vertex.co = world @ vertex.co
        obj.parent = None
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)

    points = [vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) * 0.5
    height = maximum.z - minimum.z
    scale = 1.95 / height
    turn = Matrix.Rotation(math.pi, 4, "Z")

    for obj in mesh_objects:
        for vertex in obj.data.vertices:
            centered = vertex.co - Vector((center.x, center.y, minimum.z))
            vertex.co = (turn @ centered) * scale

    points = [vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
    final_min = [min(point[axis] for point in points) for axis in range(3)]
    final_max = [max(point[axis] for point in points) for axis in range(3)]
    print(
        "DEFENDER_BOUNDS",
        {
            "min": [round(value, 6) for value in final_min],
            "max": [round(value, 6) for value in final_max],
            "size": [round(final_max[i] - final_min[i], 6) for i in range(3)],
        },
    )


def main() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))

    body = bpy.data.objects.get("H_DDS_MidRes__Body_Mid_0")
    if body is None or body.type != "MESH":
        raise RuntimeError("Expected source body mesh")

    arms: list[tuple[float, list[int]]] = []
    for component in connected_components(body.data):
        if len(component) < 900:
            continue
        points = [body.matrix_world @ body.data.vertices[index].co for index in component]
        minimum_z = min(point.z for point in points)
        maximum_z = max(point.z for point in points)
        center_x = sum(point.x for point in points) / len(points)
        if minimum_z > 89.0 and maximum_z > 116.0 and abs(center_x) > 3.0:
            arms.append((center_x, component))

    if len(arms) != 2:
        raise RuntimeError(f"Expected exactly two arm islands, found {len(arms)}")

    # The original shooter's hands converge on the ball. Opening them to an
    # asymmetric high V produces a readable ball-free contest pose while the
    # low-end shoulder pivots preserve each arm's original seam.
    arm_report = []
    for center_x, component in sorted(arms, key=lambda item: item[0]):
        angle = -47.0 if center_x < 0.0 else 39.0
        pivot, vertex_count = rotate_arm_component(body, component, angle)
        arm_report.append(
            {
                "side": "negative-x" if center_x < 0.0 else "positive-x",
                "degrees": angle,
                "vertices": vertex_count,
                "pivot": [round(value, 6) for value in pivot],
            }
        )
    print("DEFENDER_ARMS", arm_report)

    recolor_uniform_texture()

    # The basketball is a fully separate imported hierarchy. Removing every
    # object in that named subtree guarantees the derivative carries no ball.
    for obj in list(bpy.data.objects):
        if obj.name.startswith("BASKETBALL2"):
            bpy.data.objects.remove(obj, do_unlink=True)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    flatten_and_normalize(mesh_objects)

    body["aura_attribution"] = "Basketball player by 3DDomino"
    body["aura_source_url"] = (
        "https://sketchfab.com/3d-models/"
        "basketball-player-9a1be0ed25f94e9998adee1df3a2d218"
    )
    body["aura_source_sha256"] = (
        "f67f19f62254c825103cf55472a273a470d6bf69164a0cddcbc4e369e92d7523"
    )
    body["aura_license"] = "Creative Commons Attribution 4.0 International"
    body["aura_license_url"] = "http://creativecommons.org/licenses/by/4.0/"
    body["aura_adaptation"] = (
        "Ball removed; arm islands rotated into contest pose; uniform texels "
        "recolored blue/gold; normalized to 1.95 m."
    )

    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_extras=True,
    )
    print("DEFENDER_OUTPUT", OUTPUT)


if __name__ == "__main__":
    main()
