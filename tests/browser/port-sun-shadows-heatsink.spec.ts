import { defineSunShadowSpec } from "./port-sun-shadows-lib";

defineSunShadowSpec({ id: "heatsink", url: "/examples/heatsink-port/?manual=1&quality=high&autostart=1", hook: "__AURA_HEATSINK__", begin: "begin", step: "h.stepFrames(120)" });
