# Shadowstep Gauntlet: final real-GPU frames

Route: `/apps/shadowstep-gauntlet/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | title card with controls incl. P autoplay |
| `1280-02-village-clones.jpg` | 1280x720 | early play | Lantern Village, echo clones flanking the hero, Owl Caster ahead |
| `1280-03-village-run.jpg` | 1280x720 | action | 0.7 s later: stride changed, clones mid-run |
| `1280-04-rooftop-run.jpg` | 1280x720 | second venue | Rooftop Run on tiled roofs with ridge cap, clones and Sunfire |
| `1280-05-forest.jpg` | 1280x720 | third venue | Whispering Forest log path, Ember form, clones |
| `1280-06-valley-gate-ember.jpg` | 1280x720 | finale | Valley Gate at 2,496 m: Ember form with clones, the rebuilt cascading falls behind |
| `1280-07-results.jpg` | 1280x720 | results | run complete card |
| `390-01-title.jpg` | 390x844 | title | title card |
| `390-02-village-clones.jpg` | 390x844 | early play | village with clones |
| `390-03-rooftop-run.jpg` | 390x844 | second venue | rooftop run |
| `390-04-forest.jpg` | 390x844 | third venue | forest log path, sword swing |
| `390-05-gale-star.jpg` | 390x844 | action | gale star thrown under a torii |
| `390-06-valley-gate.jpg` | 390x844 | finale | valley gate |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | Sunfire form running the Rooftop Run, river and village below |

## Checked in the frames

- hero, clones and enemies run upright with arms at the sides and feet on the road (was kneeling/arms-up from the Dash clip)
- steady stride ~3 steps/s, head faces forward (shaking/head-swing fix), consecutive burst frames steady
- rooftop: no floating bars, tile scale fixed, buildings no longer stretched
- river deep blue-teal, no green triangle in the sky, Ember bubble is a faint rim with the hero visible
- trees/houses grounded
- Valley Gate waterfall rebuilt: three staggered curved curtains falling off a cliff lip into the river with a mist band (seen at 2402-2496 m and in 390-06)

## Known issues

- valley terrain at the course end is still coarse low-poly (the finish boulder at ~2600 m)
- forest pines are the Idol model: bare curved trunks with small canopies
