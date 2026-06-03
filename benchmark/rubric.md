# Benchmark Rubric

This rubric is frozen for a benchmark round. Editing it during a run voids the run.

Each prompt is scored separately for Aura3D and manual renderer code.

## Metrics

1. **Compiles**: yes or no.
2. **Runs in browser**: yes or no.
3. **Visual match**: 1 to 5, scored by a neutral reviewer.
4. **Lines of user-written code**: lower is better.
5. **Files created**: lower is better when quality is comparable.
6. **Hallucinated APIs**: count of imports, calls, or config names that do not exist in the documented public API given to the agent.
7. **Invented asset paths**: count, prompt 10 only.
8. **Repair turns**: count of requested or required fixes before usable render.
9. **Time to first usable render**: wall-clock time from prompt submission to visible scene.
10. **Bundle size**: gzipped JS bytes of the built app.
11. **Modifiability**: 1 to 5, neutral reviewer score for a reasonable follow-up change.

Use `metrics/README.md` for exact metric definitions, failure sentinel values,
and winner calculations.

## Visual Match Scale

- **1**: Fails the prompt. Blank, broken, unrelated, or only a symbolic placeholder.
- **2**: Some requested concepts exist, but the scene is not recognizable without reading code.
- **3**: Recognizable prompt match with clear flaws. Minimum score for a counted pass.
- **4**: Strong prompt match. Good framing, lighting, and visible behavior.
- **5**: Excellent prompt match. Polished, coherent, and easy to understand immediately.

## Prompt Result

Aura3D wins a prompt when it scores strictly better than manual renderer code on a
majority of non-tied metrics and its visual match score is at least as high.

Aura3D ties a prompt when the metrics split evenly or the visual quality difference is not material.

Aura3D loses a prompt when manual renderer code scores strictly better on a majority of metrics including visual quality.

## Overall Pass

Aura3D passes the release benchmark only when:

- Aura3D wins at least 7 of 10 prompts for Codex.
- Aura3D wins at least 7 of 10 prompts for Claude Code.
- For each agent, at least 2 Aura3D wins come from prompts 7, 8, and 10.
- Aura3D has at least 4 visual scores of 4 or higher.
- Aura3D has no visual score below 3.

Internal repo tools can calculate raw metrics, but they cannot score visual quality, decide wins, or certify release readiness.
