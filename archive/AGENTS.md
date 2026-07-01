# ARCHIVE KNOWLEDGE BASE

**Scope:** `archive/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 9 - distinct legacy/held-back content.

## OVERVIEW

Archive is retained history and held-back material. It is not the default source
of current Aura3D behavior, claims, or examples.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Legacy AI runtime | `legacy-ai-runtime/` | Historical package/app/template tree. |
| Held-back templates | `held-back-create-aura3d-templates/` | Preserved template variants. |
| Legacy docs/tests | nested `docs/`, `tests/`, `apps/` | Reference only unless task targets archive. |

## CONVENTIONS

- Leave archived files unchanged unless the user explicitly asks to update
  archive content.
- If borrowing an idea from archive, reimplement it against current public API,
  asset, and claim rules rather than copying blindly.
- Do not use archive docs to answer current capability questions without
  checking current `docs/agents/claims-and-boundaries.md`.
- Keep archive-local dependencies and outputs isolated from active packages.

## ANTI-PATTERNS

- Do not modernize archive files as part of unrelated source cleanup.
- Do not cite archive examples as release-ready public examples.
- Do not copy legacy raw asset paths, raw URLs, or loader patterns into current
  examples/templates/apps.
- Do not delete archive material unless the user explicitly asks for removal.

## VERIFY

If the task specifically targets archive, run only the relevant legacy command
or static check. Otherwise treat archive findings as context, not work scope.
