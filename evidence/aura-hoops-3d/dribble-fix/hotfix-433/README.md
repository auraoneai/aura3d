# hotfix-433 grounding and dribble evidence (software WebGL2, DPR 2; NO real GPU)

No real GPU is reachable by agents (see `tools/real-gpu`), so every frame here is software WebGL2 on the remote runner at DPR 2, dev-server code of this branch. Nothing below is real-GPU verified.

## Read in frames
- **Hoops, standing, default camera** (`hoops-default-camera-standing-dpr2.jpg`, 6 frames over one bounce): the handler stands on his ring and shadow, the ball is under the hand at chest, waist and floor contact, the hand follows it down to knee height. Beacon, palm vs ball (m): XZ offset 0.001 to 0.058 in all six samples; palm 0.25 above the ball centre at floor contact (ball y 0.14 to 0.19, palm y 0.44), palm 0.07 to 0.14 above the ball at the top.
- **Hoops, standing, front-left close-up** (`hoops-front-left-standing-dpr2.jpg`, 4 frames): feet on the ring, ball in the palm at chest height, ball at the floor with the hand low at the knee. At this crop the ball at floor contact sits about a ball diameter beside the palm in one frame; not tuned further.
- **Hoops, running (WASD), both cameras: NOT READ.** The DPR 2 runs had not reached the running phase at the deadline; the running dribble stays as committed (upper-body overlay, lead capped 0.10 m) and is unconfirmed in the owner's view.
- **Cumulus Dash sprint** (`cumulus-sprint-dpr2.jpg`, 5 frames over 3.6 s): the runner's feet are planted on the road in every frame; the drawn feet (bounds min y) equal the node y to 0.00 m (71.99, 72.11, 72.19, 72.23: a smooth rise with the road slope, no bob in the sampled values). Foot-slide and hip bob in motion cannot be judged from five stills; unverified.
- **Cumulus Dash boulders** (`cumulus-boulders-dpr2.jpg`, 5 frames, start at the first boulder): the rolling boulders rest on the road instead of hovering 1.9 m above it (before: boulder floating at head height above the road). A boulder up on the cliff slope is mid rock-slide, not on the road.
- **Gridlock Courier road** (`gridlock-road-dpr2.jpg`, 8 frames over a drive with steering): the road is drawn in all 8 frames, 100 to 114 draw calls, 0 errors. The "road flips in and out" report was NOT reproduced on software GL; it needs the owner's real-GPU run.
- **Balls:** node heights after the fix (sweep runs): FC ball node y 0.00 at rest (it was 0.21 m, the ball hovering 11 cm); Links ball node y 1.95 at the tee equals the turf height (it was 5 cm up); Diamond ball node 7.5 cm below the sim centre. Frames at 1100x620 show the FC ball on the centre spot and the Links/Diamond scenes grounded, but the balls are a few pixels: ground contact at the radius is a number, not a read frame.
- **Slingshot Siege, Pips, Bunker Zero, Iron Crown, Top Tennis, Teleoperator, Drift and Deliver, Shadowstep Gauntlet, Last Train:** checked by code and by frame/number; not changed.

## Not verified / failing
- Real-GPU frames for everything above (owner: `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh hoops`).
- Hoops running dribble at DPR 2 (not reached), Hoops AI handler path at DPR 2.
- Hoops `drawn`/`handProbe` `bounds()` accessor fix is committed but not read back from a run.
- Hoops front-left close-up: one frame has the floor-contact ball about a diameter from the palm.
