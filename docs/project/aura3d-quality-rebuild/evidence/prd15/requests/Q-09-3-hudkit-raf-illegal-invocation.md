# Q-09-3 → to:prd09 (qr-request, CONTRACTS §6.5)

**Files:** `packages/game/src/hud/HudKit.ts` (09-owned)
**Contract served:** PRD-15 T8.2 — the restored `check:templates` gate runs
every create-aura3d template's browser specs; every `createGame()`-based
template died on mount with a pageerror `TypeError: Illegal invocation`.

## What lane 15 already did (courtesy fix — required to unblock the gate)

`mountHud` built its default scheduler as

```ts
rafScheduler({ requestAnimationFrame, cancelAnimationFrame })
```

which captures the native functions unbound; `win.requestAnimationFrame(cb)`
then invokes them with the wrapper as receiver and Chrome throws
`TypeError: Illegal invocation`. The exception escaped `createGameImpl` during
mount, so every createGame template left `__AURA3D_*__` globals unset and
their specs timed out.

Fix: wrap in arrow functions that call the globals correctly:

```ts
rafScheduler({
  requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id)
})
```

(`rafScheduler(window)` would also work; the wrapper keeps `window` out of the
expression so node-side imports stay safe.)

## Follow-up for lane 09

`mountHud` is also reachable through `packages/game/src/createGame.ts` touch
controls (`doc`-only mounting) — worth a unit test that mounts with a real DOM
(jsdom provides rAF as a stub already, so only a real-browser check catches
this class).
