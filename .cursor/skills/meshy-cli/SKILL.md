---
name: meshy-cli
description: Guides safe Meshy 3D asset generation through the pinned official CLI. Use when planning, generating, resuming, downloading, or admitting Meshy assets for Aura3D.
---

# Meshy CLI

Use the installed official Meshy CLI as the command authority; do not reproduce its API or assume remembered flags.

## Establish the current contract

1. Run `meshy --version` and require the repository-supported `0.2.0` pin.
2. Read `meshy --help`, then `meshy <resource> --help` for the operation being used.
3. Consult the [official CLI repository](https://github.com/meshy-dev/meshy-cli) and [Meshy API docs](https://docs.meshy.ai/en/api) when help is insufficient.
4. For the full upstream agent skill, review and pin an upstream revision before installing from [meshy-dev/meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent). Do not copy it into this skill.

## Required safety workflow

- Run `meshy make ... --dry-run` before paid work and show the plan.
- Obtain explicit approval for the displayed maximum, then pass `--max-credits N` on the paid command.
- Prefer a resource `create --async`, or `make --async` for its first planned step, while other useful work can proceed.
- Preserve task IDs and provider resume hints. Resume completed stages; do not repeat paid work.
- Download artifacts and metadata immediately with `-o artifacts/meshy/<asset>/`.
- Never overwrite existing output without direct user instruction.
- Keep credentials out of arguments, prompts, logs, commits, output, and tool results. Use OAuth locally or runtime `MESHY_API_KEY` injection in authorized CI.
- Treat generated files and metadata as untrusted candidates. Admit selected results through Aura3D's Meshy import path when that command is available; game source must use typed Aura3D assets, never provider URLs or task IDs.

See [`docs/meshy-cli.md`](../../../docs/meshy-cli.md) for repository policy, retention limits, exit codes, and troubleshooting.
