# @aura3d/workflows

`@aura3d/workflows` owns asset viewer, product configurator, material studio,
scene showcase, interactive scene, animation lab, comparison, and production
workflow helpers for Aura3D.

## Public API

- `createAssetViewerWorkflow`
- `createProductConfiguratorWorkflow`
- `createMaterialStudioWorkflow`
- `createSceneShowcaseWorkflow`
- `createInteractiveSceneWorkflow`
- `createAnimationLabWorkflow`
- `createComparisonWorkflow`
- `createWorkflowDiagnostics`
- `externalParityWorkflows`

Production-runtime helpers include `PRODUCTION_WORKFLOWS`,
`createProductionWorkflowPlan`, `runProductionExample`,
`createProductionAssetPreflight`, `createProductionRendererDefaults`, and
`createProductionVisualQAResult`.

## Package Boundary

This package creates workflow data and production-runtime workflow plans. Public
claims still need matching evidence for the workflow output and the renderer/API
path used to display it.
