/**
 * PRD-13 pre-fallthrough entry (§7.6): while the C-39 fallthrough in cli.ts is
 * pending in PR 0b-3, the lane's commands run through
 *   pnpm --filter @aura3d/cli exec tsx src/commands/prd13/run.ts look <sub> [...args]
 * Importing ./index registers the commands; longest-prefix matching mirrors
 * cli.ts so `run.ts look lint` and `run.ts look judge --validate x` dispatch
 * identically.
 */

import { cliCommandFor } from "../../contracts/commands.js";
import "./index.js";

const args = process.argv.slice(2);
let dispatched = false;
for (let words = Math.min(args.length, 4); words > 0; words--) {
  const command = cliCommandFor(args.slice(0, words).join(" "));
  if (command) {
    process.exitCode = await command.run(args.slice(words), {
      cwd: process.cwd(),
      stdout: (line) => console.log(line),
      stderr: (line) => console.error(line)
    });
    dispatched = true;
    break;
  }
}
if (!dispatched) {
  console.error(`no prd13 command matches: ${args.join(" ") || "(no args)"}\ncommands: look capture, look judge, look rubric, look lint`);
  process.exitCode = 2;
}
