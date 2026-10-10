/**
 * PRD-15 dev-server handle for the §15-SPECS browser specs.
 *
 * The lane harnesses mount `createAuraApp`, whose module graph needs the same
 * `@aura3d/rendering/contracts` specifier rewrite + `__AURA3D_VERSION__`
 * define the prd04 wrapper applies (the shared `example-dev-server` covers
 * neither). Reuse that proxy verbatim — lane-owned files aren't edited, only
 * imported — and keep the prd15 handle separate so the specs' imports stay
 * inside their lane dir per the ownership gate.
 */
import { startPrd04DevServer, type ExampleDevServer } from "../prd04/dev-server";

export type { ExampleDevServer };

export async function startPrd15DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  return startPrd04DevServer(root);
}
