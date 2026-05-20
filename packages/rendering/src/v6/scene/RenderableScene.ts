import type { Camera } from './Camera';
import type { Light } from './Lights';
import type { RenderableMesh } from './RenderableMesh';
export interface RenderableScene { readonly id: string; readonly meshes: readonly RenderableMesh[]; readonly lights: readonly Light[]; readonly camera: Camera; readonly environmentId?: string; }
