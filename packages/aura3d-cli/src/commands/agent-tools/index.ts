/** Agent tools (N6): `info`, `examples`, `validate`, `render`. An agent can author, validate, render, inspect and correct without leaving the CLI (docs/agents/agent-tools.md). */
import { registerCliCommand } from "../../contracts/commands.js";
import { EXAMPLES_USAGE, examplesCommand } from "../../agent-tools/examples.js";
import { INFO_USAGE, infoCommand } from "../../agent-tools/info.js";
import { RENDER_USAGE, renderCommand } from "../../agent-tools/render.js";
import { VALIDATE_USAGE, validateCommand } from "../../agent-tools/validate.js";

registerCliCommand({ name: "info", owner: "agent-tools", summary: "Installed Aura3D versions and the @aura3d/engine API surface (namespaces and members) read from the installed types; --name <export> for signatures.", usage: INFO_USAGE, run: (argv, io) => infoCommand(argv, io) });
registerCliCommand({ name: "examples", owner: "agent-tools", summary: "Find a working recipe or template for a task (offline) and print its source.", usage: EXAMPLES_USAGE, run: (argv, io) => examplesCommand(argv, io) });
registerCliCommand({ name: "validate", owner: "agent-tools", summary: "Static checks of scene source: colours, unknown options/members/exports, invented assets, framing, lighting.", usage: VALIDATE_USAGE, run: (argv, io) => validateCommand(argv, io) });
registerCliCommand({ name: "render", owner: "agent-tools", summary: "Build, serve and screenshot the app in headless Chrome; diagnostics JSON with errors, codes, luma/saturation and subject fill.", usage: RENDER_USAGE, run: (argv, io) => renderCommand(argv, io) });

export {};
