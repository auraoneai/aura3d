# Q-03-5 → to:prd03 (qr-request, CONTRACTS §6.5)

**Files:** `packages/engine/src/agent-api/nodes/effects.post.ts` (03-owned)
**Contract served:** PRD-15 T8.2 — `pnpm build` (`tsc -p tsconfig.build.json`)
must pass for `pack:check`.

## What lane 15 already did (courtesy fix — required to unblock the build)

`PostV3EffectOptions` was a non-exported interface consumed by the exported
`postEffectBuilders` object; declaration emit failed:

```
error TS4023: Exported variable 'effects' has or is using name
'PostV3EffectOptions' from external module ".../effects.post" but cannot be named.
```

`export` added to the interface (line 12). No runtime change; the type only
becomes nameable for `.d.ts` emit. The interface's header comment already
described it as a local widening pending a lane-15 `nodes/types.ts` union
field — exporting does not widen the runtime surface (`effects.post` is not
re-exported anywhere new).

## Follow-up for lane 03

None blocking — if you prefer the type internal, move `postEffectBuilders`
behind a facade type instead and revert the export.
