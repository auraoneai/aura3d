# Shadowstep Gauntlet: sun shadows on

Remote software WebGL2 (`tests/browser/port-sun-shadows-ninja-runner.spec.ts`, run `p1shadow-f-ninja-runner`), 640x360, autopilot to 90 m, `?shadow=0` vs default. Not real-GPU evidence.

| | mean luma | draw calls |
|---|---|---|
| `?shadow=0` | 148.75 | 51 |
| sun shadow (2 cascades, 90 m) | 146.99 | 127 (budget 133) |

The earlier "whole frame darkens by 8 to 14 luma points" was the 4000 m sky dome casting into the cascades (luma 142.79 against 157.46 at the run-start frame, `ninja-shadow-bisect` runs). Non-instanced casters larger than four shadow distances are now skipped (`shadow.caster.oversize:*` in `droppedFeatures`), so the lit frame matches the no-shadow frame apart from real shadows. The sun is behind the camera here, so shadows fall away from it and are subtle in this frame; the village models, trees and actors now cast.
