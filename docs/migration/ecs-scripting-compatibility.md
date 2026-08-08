# ECS and scripting compatibility migration

## Aura3D 1.6

`@aura3d/ecs` and `@aura3d/scripting` are optional packages. Existing
`@aura3d/engine/ecs` and `@aura3d/engine/scripting` compatibility imports remain
available for the 1.x line, but new code should import the dedicated package:

```ts
import { World, TransformComponent } from "@aura3d/ecs";
import { BehaviorHost, VisualGraphExecutor } from "@aura3d/scripting";
```

Do not add either package to a renderer, product viewer, or arcade application
that does not use it. They are application architecture/authoring choices, not
proof of rendering parity.

## Aura3D 2.0 plan

The duplicate engine subpaths are scheduled for removal. A codemod will rewrite
specifier-only imports:

```text
@aura3d/engine/ecs       -> @aura3d/ecs
@aura3d/engine/scripting -> @aura3d/scripting
```

The symbol names are unchanged. Consumers must add the destination package to
their manifest. Dedicated-package removal is not scheduled: it requires a
separate external adapter, consumer migration, and deletion-safety proof.
