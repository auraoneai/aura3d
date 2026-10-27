# ECS and scripting compatibility migration

## Aura3D 4.0

`@aura3d/ecs` and `@aura3d/scripting` are optional packages. Existing
`@aura3d/engine/ecs` and `@aura3d/engine/scripting` compatibility imports remain
available as deprecated aliases throughout 2.x, but new code should import the dedicated package:

```ts
import { World, TransformComponent } from "@aura3d/ecs";
import { BehaviorHost, VisualGraphExecutor } from "@aura3d/scripting";
```

Do not add either package to a renderer, product viewer, or arcade application
that does not use it. They are application architecture/authoring choices, not
proof of rendering parity.

## Compatibility schedule

The duplicate engine subpaths are eligible for removal in 3.0, not before
2027-08-11, and only after fresh packed-consumer evidence. The 2.0 codemod rewrites
specifier-only imports:

```text
@aura3d/engine/ecs       -> @aura3d/ecs
@aura3d/engine/scripting -> @aura3d/scripting
```

The symbol names are unchanged. Consumers must add the destination package to
their manifest. Dedicated-package removal is not scheduled: it requires a
separate external adapter, consumer migration, and deletion-safety proof.

The 3.x to 4.0 and 2.0 removal records are kept in the archived guides under `docs/archive/docs/`.
