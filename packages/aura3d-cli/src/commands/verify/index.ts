/** `aura3d verify`: the author -> validate -> render -> inspect -> correct loop as one JSON report (docs/agents/verify-loop.md). */
import { registerCliCommand } from "../../contracts/commands.js";
import { VERIFY_USAGE, verifyCommand } from "../../verify/command.js";

registerCliCommand({
  name: "verify",
  owner: "agent-loop",
  summary: "Typecheck, asset check, lint, build, serve, render in Chrome and inspect a project; emit one JSON report (--json).",
  usage: VERIFY_USAGE,
  run: (argv, io) => verifyCommand(argv, io)
});
