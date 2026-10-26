/** Level-0-only run of the Roadster Hours art frames (the remote runner does not forward env vars). Remote only. */
process.env.RH_ART_LEVELS ??= "0";
await import("./roadster-hours-art-frames.spec");
