# Scene Graph Versus ECS

Galileo3D exposes both scene graph and ECS-style runtime concepts. They solve different coordination problems and should not be treated as interchangeable APIs.

## System Boundary

The scene graph owns authored hierarchy and spatial relationships. ECS owns dense component data and scheduled behavior. Integration code should copy state across that boundary deliberately instead of letting both systems mutate the same transform or identity at the same time.

## Use The Scene Graph For Spatial Authoring

Use scene nodes when hierarchy, transforms, cameras, lights, and imported asset structure matter. glTF import, editor hierarchy, camera placement, and renderer-facing transforms naturally map to scene graph objects.

Scene graph code is a good fit when an object has a parent, a local transform, and visible or authored state that a developer expects to inspect.

## Use ECS For Dense Runtime State

Use ECS when behavior is data-oriented, repeated across many entities, or scheduled as systems. Physics synchronization, gameplay state, and large batches of similar runtime objects are better fits for components and queries.

ECS code is a good fit when the app needs predictable system ordering and compact state updates more than authored hierarchy.

## Bridge Deliberately

Avoid duplicating the same source of truth in both systems. If a physics body drives a scene node, define which side writes the transform and which side reads it. If an editor action creates a visible object, keep the serialized scene identity stable and let ECS state reference it only when needed.

## Current Limits

The current examples prove bounded scene, ECS, and physics integration slices. They do not prove a large production editor workflow where every scene object has an ECS mirror or a complete prefab/composition runtime.
