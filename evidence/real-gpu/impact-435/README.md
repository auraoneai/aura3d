# Impact frames on the live 4.3.5 pages (software GL, SwiftShader)

Read by hand on 2026-10-26. Chromium on the remote runner (ANGLE/SwiftShader; ALIASED_POINT_SIZE_RANGE [1,1023]), not a real GPU.

- FC (effects off and on): the shot and goal sequence frames show a clean pitch. The scoreboard reads 0-0 in all of them, so the test hooks did not produce a real shot or goal: this is weak evidence about the goal moment.
- Links, effects on, DPR 2, after a shot: no bubbles; only the small yellow shot-trail dots. The club shaft is attached to the grip at the hands and the arm is visible.
- Iron Crown, effects off: round start and a five-hit exchange show no bubbles or dots (the small white squares in the background are the crowd lights).

What this does and does not show: the owner's bubbles do not appear on SwiftShader with effects on or off, so the runner cannot find their cause. Runtime effects are off by default in Links, FC and Iron Crown (4.3.5) as a precaution. To name the cause the owner opens the page with `?vfxdebug=1` while the dots are visible, or runs `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all`.

## Follow-up capture (2026-10-26, 20:00)

- Iron Crown with `?vfx=on`: round start and a light/heavy hit exchange (`iron-crown-effects-on-*.jpg`) show no bubbles or dots on the runner. Combined with the effects-off frames this means the runner shows no bubbles under any setting.
- Cumulus Dash: the zoomed clip at DPR 3 caught the rolling log filling the frame, not the hero, so it cannot judge the feet. Not usable; the feet remain judged only from unit tests and offline silhouettes.
- Hoops running dribble: the capture run failed (exit 1), so no new frames. The earlier frames (DPR 2 default camera, software GL) stand.
