# Craterline GP: phone title and track paint (last fix)

1. Phone title (390 px): the menu panel gets a soft dark backdrop and the "ABOVE. BELOW. BEYOND." tagline is anchored to the left edge at 20 px, so it is no longer cut off and the chips no longer sit over the bike unreadably. `before/title-390.jpg`, `after/title-390.jpg`.
2. Track paint: the impasto pattern is now world-space triplanar noise (no UV mapping), so the marks have the same size in every direction instead of long streaks along the whole track. `before/boost-1280.jpg`, `after/boost-1280.jpg`. The paint is still soft, wide blotches in perspective (judged by eye, no metric).

Remote run `fixbl-orbit` (software WebGL2, not a GPU), 4 specs passed; the track shader still compiles and links in `shaders-compile.test.ts`.
