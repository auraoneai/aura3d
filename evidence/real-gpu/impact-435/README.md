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

## Hoops running dribble and Cumulus Dash sprint (live 4.3.5, software GL, read by hand 2026-10-26 20:40)

- Hoops, Quick Play, human handler, 960x600 DPR 1 (the 2x run timed out on frame capture; the file names say dpr2 from the harness label, the size is 1x). `hoops-running-dribble-numbers.txt` has the per-frame numbers. At the meet (cycle 0.22) palm and ball are 0 to 12 px apart horizontally; at the floor contact (cycle 0.72) the ball is on the floor (y 0.23 to 0.25 m) about one ball diameter below the palm, with the palm 0.52 to 0.57 m high and the handler bent forward. Frames `hoops-running-dribble-meet.jpg` and `-floor-contact.jpg` show the ball in the hand at the top and landing in front of the hand on the floor. Shorts, neck and shoulders are intact. This is the owner's complaint area, but it is software GL, not the owner's GPU.
- Cumulus Dash sprint at 1200x840 (hero about 150 px tall): the hero runs in his sprint pose with the log in the foreground; the log hides his feet in this frame, so planted feet cannot be judged here. Gait numbers: groundSpeed 14.5 m/s, cadence 4.03 steps/s, stance 0.047 s.

## Cumulus Dash after the intro (live 4.3.5, software GL, 640x400 DPR 2, read by hand)

`cumulus-dash-sprint-after-intro.jpg`: the hero runs on the ground after the log intro, seen from behind at about 110 px tall: legs alternate (one foot raised behind, the other on the ground), body leans forward, no hyper-extension and no sliding pose visible. `cumulus-dash-jump-over-log.jpg`: the hero jumping the log with arms out and legs tucked. At this size and from behind the planted-foot contact itself is not resolvable; the foot-slide verdict still rests on the gait unit tests (planted-foot p95 0.00 to 0.02 m/s) and the offline silhouettes. No defect was seen in the frames.
