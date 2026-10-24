/** Evidence commands: `evidence judge` (blind A/B model judge, promoted from the Crayon-port capture tools). */

import { registerCliCommand } from "../../contracts/commands.js";
import { JUDGE_USAGE, runJudge } from "./judge.js";

registerCliCommand({
  name: "evidence judge",
  owner: "evidence-tooling",
  summary: "Blind A/B model judge over two folders of matched frames (Kiro Prism; a model, not a human).",
  usage: JUDGE_USAGE,
  run: (argv, io) => runJudge(argv, io)
});

export {};
