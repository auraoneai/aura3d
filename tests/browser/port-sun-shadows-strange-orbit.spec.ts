import { defineSunShadowSpec } from "./port-sun-shadows-lib";

defineSunShadowSpec({ id: "strange-orbit", url: "/examples/strange-orbit-port/?manual=1&autostart=1&mode=trial&quality=high", hook: "__AURA_STRANGE_ORBIT__", begin: "begin", step: "h.stepFrames(120)" });
