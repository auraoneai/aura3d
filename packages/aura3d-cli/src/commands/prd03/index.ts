/**
 * C-39 lane command registrations — prd03 (CONTRACTS.md §3.8).
 * Registers the `post-v2` codemod (report mode) from `tools/quality-rebuild/codemods/`.
 */

import { registerCodemod } from "../../contracts/commands.js";
import { postV2Codemod } from "../../../../../tools/quality-rebuild/codemods/post-v2.mjs";

registerCodemod(postV2Codemod);

export { postV2Codemod };
