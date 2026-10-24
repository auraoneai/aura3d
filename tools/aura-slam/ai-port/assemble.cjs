const fs = require('fs'); const S = require('./sets.cjs');
const R = JSON.parse(fs.readFileSync(require('os').tmpdir() + '/slam-ai-gen-result.json', 'utf8'));
const W = '' + process.cwd() + '/examples/aura-slam/sim';
fs.mkdirSync(W, { recursive: true });
const src = fs.readFileSync('' + process.cwd() + '/tests/fixtures/aura-slam-original/toptennis/match-engine.js', 'utf8').split('\n');
const grab = (a, b) => src.slice(a - 1, b).join('\n');
// tables: lines 17-23 SERVE_CPU, 29 PRO_POSITION, 30-36 SERVE_RETURN, 57-62 CPU_STYLES
const tables = `/* Tables transcribed verbatim from public/toptennis/match-engine.js (SERVE_CPU l.17, PRO_POSITION l.29, SERVE_RETURN l.30, CPU_STYLES l.57). */
${grab(17,23).replace('const SERVE_CPU','export const SERVE_CPU: Readonly<Record<string, any>>')}
${grab(29,29).replace('const PRO_POSITION','export const PRO_POSITION: Readonly<Record<string, number>>')}
${grab(30,36).replace('const SERVE_RETURN','export const SERVE_RETURN: Readonly<Record<string, any>>')}
${grab(57,62).replace('const CPU_STYLES','export const CPU_STYLES: Readonly<Record<string, any>>')}
`;
fs.writeFileSync(W + '/aiTables.ts', tables);
const indent = t => t.split('\n').map(l => l ? '  ' + l : l).join('\n');
function body(pieces) { return pieces.map(p => `  // match-engine.js l.${p.line}\n` + indent(p.text)).join('\n\n'); }
const aiOrder = R.ai; // AIVARS (netPreference, cpuStyle) must come first: sort by source line
aiOrder.sort((a, b) => a.line - b.line);
const aiExports = ['makeAITactics','serveAnticipation','serveReceiverDepth','planCPUServe','advanceReturnPrediction','proContactPressure','recordProContact','readProPattern','proBalancedContactAhead','scheduleAIRead','updateAI','aiShotPlan','serveBalancedContactAhead'];
const allAiNames = [...S.AIVARS, ...S.AI];
const envNames = R.aiEnv.map(([k]) => k);
const aiTs = `/* AI module: CPU opponent decisions, transcribed from public/toptennis/match-engine.js (the closure functions listed in AI_OWNED_NAMES).
 * Every function keeps its source name, body and constants; the only mechanical change is that free closure variables of the
 * original factory are read from \`env\` (AiEnv), which the match engine builds from its own closure. */
import { CPU_STYLES, PRO_POSITION, SERVE_CPU, SERVE_RETURN } from "./aiTables";

export const AI_OWNED_NAMES: readonly string[] = ${JSON.stringify(allAiNames)};
export const AI_ENGINE_EXPORTS: readonly string[] = ${JSON.stringify(aiExports)};
export const AI_ENV_NAMES: readonly string[] = ${JSON.stringify(envNames)};

/** Free variables of the original \`create()\` closure that the AI reads. Live bindings: always read through \`env.x\`. */
export interface AiEnv {
${envNames.map(n => `  readonly ${n}: any;`).join('\n')}
}

export function createAiModule(env: AiEnv) {
${body(aiOrder)}

  return { ${allAiNames.join(', ')} };
}
export type AiModule = ReturnType<typeof createAiModule>;
`;
const FIXES = [['{beginner:.14,club:.20,ace:.24,pro:.30,legend:.34}[env.state.difficulty]', '(({beginner:.14,club:.20,ace:.24,pro:.30,legend:.34}) as Record<string, number>)[env.state.difficulty]']];
let aiOut = aiTs; for (const [f, r] of FIXES) { if (!aiOut.includes(f)) throw new Error('fix not found ' + f); aiOut = aiOut.replace(f, r); }
fs.writeFileSync(W + '/ai.ts', aiOut);
const swEnv = R.swEnv.map(([k]) => k);
const swOrder = R.sw.sort((a, b) => a.line - b.line);
const swTs = `/* Swipe-shot module: touch-swipe control state and the swipe-driven player, transcribed from public/toptennis/match-engine.js
 * (functions listed in SWIPE_OWNED_NAMES). Free closure variables of the original factory are read from \`env\` (SwipeEnv). */
export const SWIPE_OWNED_NAMES: readonly string[] = ${JSON.stringify(S.SWIPE)};
export const SWIPE_ENV_NAMES: readonly string[] = ${JSON.stringify(swEnv)};
export const SWIPE_ENGINE_EXPORTS: readonly string[] = ${JSON.stringify(['makeSwipeState','swipeEligible','swipeActive','clearSwipeAttempt','swipeBoundary','recordSwipeFlight','updateSwipePlayer'])};

export interface SwipeEnv {
${swEnv.map(n => `  readonly ${n}: any;`).join('\n')}
}

export function createSwipeModule(env: SwipeEnv) {
${body(swOrder)}

  return { ${S.SWIPE.join(', ')} };
}
export type SwipeModule = ReturnType<typeof createSwipeModule>;
`;
fs.writeFileSync(W + '/swipe.ts', swTs);
console.log('written', aiTs.length, swTs.length);
