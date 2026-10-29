# RH-13 branch and worktree sprawl (measured 2026-10-29)

Read-only measurement by lane E5. Nothing was deleted, pruned or fast-forwarded: removing other people's branches and worktrees, and moving local `main`, are owner actions (`docs/audits/execution-plan.md`, lane rules; AGENTS.md precedence).

| Measure | Value | Command |
| --- | ---: | --- |
| Remote heads on origin | 778 | `git ls-remote --heads origin \| wc -l` |
| Remote-tracking branches merged into origin/main | 416 | `git branch -r --merged origin/main` (list: `rh13-remote-merged.txt`) |
| Remote-tracking branches with commits not in origin/main | 365 | `git branch -r --no-merged origin/main` (list with last-commit date and commits ahead: `rh13-remote-unmerged.txt`) |
| Worktrees attached to the main checkout | 111 (89 under `.claude/worktrees`, 18 under `/tmp`) | `git worktree list` (`rh13-worktrees.txt`) |
| Prunable worktrees (directory gone) | 0 | `git worktree list --porcelain \| grep -c prunable` |
| Local `main` behind origin/main | 133 commits (local `main` at 1b89fe28b) | `git rev-list --count main..origin/main` |

The audit's "1 unmerged branch" counted only the release branches; by `--no-merged` all 365 unmerged branches were last committed in October 2026, so age alone does not separate the abandoned ones.

## Owner steps (not run)

1. Delete merged remote branches after a review of `rh13-remote-merged.txt`: `git push origin --delete <branch>` per line (keep `main` and any protected release branch).
2. Review `rh13-remote-unmerged.txt`; each line is `<last commit date> <commits ahead of origin/main> <branch>`.
3. Remove finished worktrees with `git worktree remove <path>` after their owners confirm, then `git worktree prune`. The audit-fix worktrees (`.claude/worktrees/audit-*`) stay until the program merges.
4. Fast-forward local main: `git -C /Users/gurbakshchahal/platforms/aura3d checkout main && git merge --ff-only origin/main` (the main checkout currently has untracked `docs/audits/` and `docs/prds/veer-wonder-world/MASTER-PROMPT.md`, which a fast-forward does not touch).
