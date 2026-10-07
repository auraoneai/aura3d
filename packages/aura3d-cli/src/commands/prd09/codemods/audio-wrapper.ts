/**
 * Codemod `prd09-audio-wrapper` (PRD-09 §10 step 5): flags raw DOM/WebAudio
 * entry points for replacement with `game.audio`/`createGameAudio`; rewrites
 * the mechanical cases (`new Audio(`, `document.createElement("audio")`,
 * `new AudioContext(`) and reports the rest.
 */
import type { AuraCodemod } from "../../../contracts/commands.js";

export const audioWrapperCodemod: AuraCodemod = {
  name: "prd09-audio-wrapper",
  owner: "prd09",
  description: "Route raw audio entry points through the game audio surface (PRD-09 step 5).",
  transform(source, fileName) {
    const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string }[] = [];
    const out: string[] = [];
    source.split("\n").forEach((line, i) => {
      let next = line;
      if (/new\s+Audio\s*\(/.test(line)) {
        next = line.replace(/new\s+Audio\s*\(/, "game.audio.element(");
        rows.push({ file: fileName, line: i + 1, construct: "new Audio(...)", mapping: "approximate", target: "game.audio.element(...)" });
      } else if (/document\.createElement\(["']audio["']\)/.test(line)) {
        next = line.replace(/document\.createElement\(["']audio["']\)/, 'game.audio.element()');
        rows.push({ file: fileName, line: i + 1, construct: 'document.createElement("audio")', mapping: "approximate", target: "game.audio.element()" });
      } else if (/new\s+AudioContext\s*\(/.test(line)) {
        next = line.replace(/new\s+AudioContext\s*\(/, "game.audio.context(");
        rows.push({ file: fileName, line: i + 1, construct: "new AudioContext(...)", mapping: "approximate", target: "game.audio.context(...)" });
      } else if (/HTMLAudioElement|AudioBufferSourceNode|createOscillator|\.play\(\)/.test(line)) {
        rows.push({ file: fileName, line: i + 1, construct: line.trim(), mapping: "none", note: "audio surface — review manually" });
      }
      out.push(next);
    });
    return { code: out.join("\n"), rows };
  }
};
