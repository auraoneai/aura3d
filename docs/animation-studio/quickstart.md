# Animation Studio — 5-Minute Quickstart

Turn a text prompt into a rendered animated short. **No separate LLM, no API key** — deterministic rules build the scene from your sentence. Renders are **silent by design** (AuraVoice owns the voice track).

For the full reference, see [`guide.md`](./guide.md).

---

## Setup (3 lines)

```sh
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio
npm install        # or pnpm install
```

All commands below run from the `my-studio` directory.

---

## Path A — the Studio web app (visual, no commands needed)

**1. Launch**

```sh
npm run studio
```

Opens your browser at `http://localhost:5188` with a 3-pane NLE.

**2. Generate a scene from a sentence**

In the **✨ New scene** bar at the top, type a description and click **Generate scene**:

> *"a mechanic and a customer arguing about a broken car"*

What happens (takes ~25 seconds):
- The Director parses the sentence and picks the Garage set
- Two characters stage out across 3 shots
- Six placeholder dialogue lines are placed on the timeline
- A preview render starts automatically so the Stage shows the actual video

The spinner stays active until the render is done — you'll see the video appear on the Stage.

**3. Make it longer (same characters)**

Click **+ Continue scene**. This appends another shot to the *same* scene — same garage, same mechanic and customer. Keep adding shots to build a longer sequence.

**4. Hit Play**

The transport bar under the Stage controls the video. Scrub the Timeline to jump between shots.

**5. Render the final video**

Click the **Render** button (top right). The silent `.webm` is written to:
```
dist/episodes/scene/episode-3d.webm
```

---

## Path B — the CLI (fastest for agents)

**1. Generate**

```sh
npx tsx scripts/animation-scene.ts new --prompt "two robots fixing a car in a garage" --full
```

**2. Render**

```sh
npx tsx scripts/animation-scene.ts render              # fast preview
AURA_QUALITY=final npx tsx scripts/animation-scene.ts render    # 1080p
```

Output: `dist/episodes/scene/episode-3d.webm`

**3. Edit**

```sh
npx tsx scripts/animation-scene.ts dialogue --line l1 --speaker robot-1 --text "Hand me the wrench." --start 0 --end 2.5
npx tsx scripts/animation-scene.ts render
```

Useful: `show`, `validate`, `undo`.

---

## What the sets are

| Say one of these words in your prompt | You get |
|---|---|
| office, desk, cubicle, meeting, computer | Office |
| garage, workshop, mechanic, tools, car | Garage |
| kitchen, cook, dinner, chef, stove | Kitchen |
| meadow, park, forest, sunny, grass | Meadow |
| space, station, astronaut, planet, ship | Space station |
| moon, garden, night, bedtime, glow | Moon garden |
| (anything else) | Neutral studio |

---

## Tips

- **Quality:** preview (fast, 480p) | `AURA_QUALITY=final` (1080p). **Style:** `AURA_RENDER_STYLE=toon` (cel look) | `pbr` (realistic).
- **Renders are silent** — AuraVoice adds the voice track afterward.
- **Best scope:** 1–2 characters talking on a single set. Swap in your own rigged GLB anytime: `cast add --id <id> --file <model.glb>`.
- The Studio and CLI edit the **same** `dist/scene/working.document.json`. Generate in one, refine in the other.
- For real dialogue, replace the placeholder lines. The Director stages the acting around your words.
