/**
 * C-39 lane command registrations — prd03 (CONTRACTS.md §3.8).
 * Registers the `post-v2` codemod (report mode); the pure transform is
 * packaged at `src/codemods/post-v2.ts` (vendored from
 * `tools/quality-rebuild/codemods/post-v2.mjs` — keep them in sync).
 */

import { registerCodemod } from "../../contracts/commands.js";
import { postV2Codemod } from "../../codemods/post-v2.js";

registerCodemod(postV2Codemod);

export { postV2Codemod };
