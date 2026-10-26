# Neck gap: fixed (4.3.3)

In 4.3.2 the shared torso-tube rebuild closed the collar under the chin and left the head floating 5 to 7 cm above the shoulders in the bind pose, in every clip.

`tools/aura-athletes/add-neck.ts` appends a short skin tube (20 segments, 10 rings) from just inside the collar cap into the base of the head, weighted Chest to Head with a smoothstep ramp, skin colour. It only adds vertices and triangles, so palm points and head-bone positions are unchanged. Worst triangle stretch over every shipped clip is 1.59x to 1.60x (limit 1.6x, 0 over); the skin and athlete unit tests pass.

- `cpu-close-ups-all.png`: CPU close-ups, side (top row) and front (bottom row), Hoops Big, Hoops Guard, Links, FC striker, FC keeper, Diamond. `cpu-before.png` / `cpu-after.png` (Diamond side view).
- Game-camera frames from the remote runner (software GL): `card-dpr2.jpg` is 720x450 CSS at DPR 2; `play-mid.jpg` / `swing.jpg` are 1280x720 DPR 1.
- Head turn and nod: Sprint_Loop, Crouch, Shoot, Sword_Attack, Punch_Jab, Jump, Contest and Plant were rendered for Hoops and FC with no gap or overlap.

Limits: the games' own cameras are far from the athletes, so the close-ups are the CPU renders; the FC head mesh itself is ragged (unchanged by this fix).
