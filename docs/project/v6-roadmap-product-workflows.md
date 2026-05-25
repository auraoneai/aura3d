# Product Workflows

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 defines product, asset, material, architecture, and cinematic workflows. Each workflow includes required asset classes, required renderer features, required proof, production defaults, and differentiation.

Workflow APIs:

```ts
import {
  createV6WorkflowPlan,
  createV6AssetPreflight,
  createV6VisualQAResult
} from "@galileo3d/engine/workflows/production-runtime";
```

Primary evidence:

- `tests/reports/production-runtime-workflows-readiness.json`
