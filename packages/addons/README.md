# @aura3d/addons

Optional Aura3D modules for spatial DOM and vector output, alternative visual outputs, procedural objects and generators, editable geometry tools, and bounded worker tasks. Each module is independently authored for Aura3D. These entrypoints are separate from the engine root, and can be imported individually, for example:

```ts
import { WorkerPool } from "@aura3d/addons/utils/WorkerPool";
import { fractureConvex } from "@aura3d/addons/tools/Fracture";
```

Install the package alongside compatible Aura3D packages. Output effects use `@aura3d/rendering`; that package is declared as a dependency. DOM renderers require browser DOM objects when constructed. Each module documents its own input limits, ownership, teardown, and unsupported content. Generated geometry and outputs remain caller-owned unless the API explicitly transfers ownership.

The package provides source implementations; browser and hardware support claims require the applicable runtime evidence.
