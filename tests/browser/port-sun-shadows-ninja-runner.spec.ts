import { defineSunShadowSpec } from "./port-sun-shadows-lib";

defineSunShadowSpec({ id: "ninja-runner", url: "/examples/ninja-runner-port/?manual=1&quality=high", hook: "__AURA_NINJA_RUNNER__", begin: "begin", step: "h.setAutopilot(true); h.advanceTo(90, [], 60000); if (h.settle) h.settle(6, 0.06)" });
