# Ion Circuit: countdown (last fix)

Problem: the large "3" sat over the objective text and the drone. Fix: the countdown now sits at the top centre (padding-top max(15vh, 96px)) and the objective card is hidden while the countdown shows (`body:has(#count:not(.hidden)) #objective`). `before/early-390.jpg`, `after/early-390.jpg`.

Remote run `fixbl-circuit` (software WebGL2, reduced 640x360 canvas, not a GPU), 4 specs passed. No finished-race results card is captured (the strike replay never reaches the finish line on software GL).
