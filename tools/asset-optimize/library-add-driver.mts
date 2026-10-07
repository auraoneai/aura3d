// Drives `assets library add` without the full CLI boot (create-aura3d dist
// isn't built in dev checkouts). Same code path as `aura3d assets library`.
import { assetsLibraryVerb } from "../../packages/aura3d-cli/src/commands/prd05/library.js";

const projectDir = process.cwd();
const code = await assetsLibraryVerb({
  projectDir,
  argv: process.argv.slice(2),
  stdout: (l) => console.log(l),
  stderr: (l) => console.error(l),
});
process.exit(code);
