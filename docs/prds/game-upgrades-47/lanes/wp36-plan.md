# WP-36 Meshy and asset batch plan (GU47)

Generated 2026-10-30 from the PRD game WPs (Meshy line plus the M/S/C rows that use each asset). Machine-readable twin: [wp36-plan.json](wp36-plan.json); the pipeline is [wp36-pipeline.mjs](wp36-pipeline.mjs).

Priority: **P1** used by an M row, **P2** S, **P3** C (a dependency takes its earliest user's priority). Run order: P1 for all 25 games round-robin, then P2, then P3. Every row is reserved and settled in `aura3d meshy ledger` under the tag `gu47-<slug>`.

Ops: `text-to-3d` = preview + refine (2k, PBR); `retexture` = local source GLB through the CLI's local-file path (original UVs, PBR, 2k), geometry hash before/after; `rig` = Meshy rigging at the given height plus its basic walk/run clips; `animate` = one animate task per clip, merged onto the rig and checked with `validate-animation --require-rig`.

| Priority | Rows | text-to-3d | retexture | rig | animate rows (tasks) | Estimated credits |
|---|---|---|---|---|---|---|
| P1 | 496 | 390 | 78 | 14 | 14 (44) | 12682 |
| P2 | 186 | 110 | 46 | 12 | 18 (40) | 3940 |
| P3 | 15 | 3 | 10 | 1 | 1 (2) | 201 |
| all | 697 | 503 | 134 | 27 | 33 | 16823 |

Estimates use the ledger's published costs (preview 20 + refine 10, retexture 10, rigging 5, animate 3 per clip). The Prism pool had 9,747 credits when the plan was written, so the run is expected to stop on exhaustion inside P1/P2 and resume after the pool resets.

Not planned as paid rows (reasons): rigged hoops net, slingshot boar clips, cross-hop hawk clips and last-train gull rig (Meshy rigging is humanoid only); bunker hound (quadruped); iron-crown shrine/tower remesh (replaced by new low-detail generations); where-the-wind unused lantern admission (not a Meshy generation; the game lane admits it).

## G01 top-tennis (prefix `tennis`)

Style: long-lens TV tennis broadcast realism, navy, racing green, terracotta and teal with small electric-yellow accents, powder-coated aluminium, painted steel, canvas and fibreglass.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `tennisSegTorso` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic torso segment of a modular figure wearing an ivory tennis polo with a navy collar, chest to waist only, no arms or head |
| `tennisSegPelvis` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic hip segment of a modular figure wearing pleated navy tennis shorts, waist to upper thigh only |
| `tennisSegHead` | text-to-3d | P1 | prop | prop | TT-A1 |  | stylised athlete head segment with short hair and a terry sweatband, calm neutral face, ends at the jaw |
| `tennisSegUpperArm` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic upper arm segment of a modular figure, shoulder to elbow, with an ivory short-sleeve edge |
| `tennisSegForearm` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic forearm segment of a modular figure, elbow to wrist, with a navy terry wristband |
| `tennisSegHand` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic hand segment of a modular figure in a relaxed gripping pose, wrist to fingertips |
| `tennisSegThigh` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic thigh segment of a modular figure, hip to knee, smooth and toned |
| `tennisSegShin` | text-to-3d | P1 | prop | prop | TT-A1 |  | athletic lower leg segment of a modular figure, knee to ankle, ending in a white sport sock |
| `tennisSegShoe` | text-to-3d | P1 | prop | prop | TT-A1 |  | single court tennis shoe in white leather with navy and teal panels and a gum sole |
| `tennisSegVisor` | text-to-3d | P1 | prop | prop | TT-A1 |  | sports visor cap in ivory fabric with a navy curved brim |
| `tennisRacket` | text-to-3d | P1 | prop | prop | TT-A1 |  | modern tennis racket with a navy and electric-yellow frame, taut strings and a wrapped grip |
| `tennisUmpireChair` | text-to-3d | P1 | prop | prop | TT-A2 |  | tall tennis umpire chair with a ladder, footrest platform and small sun canopy, racing green painted metal |
| `tennisUmpireSeated` | text-to-3d | P1 | humanoid | prop | TT-A2 |  | seated tennis umpire in a navy blazer and cap, sitting upright on an invisible high seat, hands resting on knees |
| `tennisLineJudgeChair` | text-to-3d | P1 | prop | prop | TT-A2 |  | low folding line-judge chair with a navy canvas seat and slim aluminium frame |
| `tennisBallKid` | text-to-3d | P1 | humanoid | prop | TT-A2 |  | teenage ball kid crouched in a ready stance at courtside, teal shirt and navy shorts, generic person |
| `tennisPlayerBench` | text-to-3d | P1 | prop | prop | TT-A2 |  | courtside player bench with a racing green slatted seat, towel rail and drinks cooler slot |
| `tennisBallBasket` | text-to-3d | P1 | prop | prop | TT-A2, TT-W1 |  | wire ball basket on a rolling stand filled with bright yellow tennis balls |
| `tennisRadarPost` | text-to-3d | P1 | prop | prop | TT-A2, TT-W1 |  | slim courtside speed radar post with a dark sensor head on a navy pole and weighted base |
| `tennisScoreboardFrame` | text-to-3d | P1 | environment | background | TT-A2 |  | freestanding broadcast scoreboard frame with a blank dark panel, navy steel housing and side supports |
| `tennisFloodMast` | text-to-3d | P1 | environment | background | TT-A2 |  | tall stadium floodlight mast with a rectangular bank of twelve lamps on a lattice steel pole |
| `tennisFanA` | text-to-3d | P1 | humanoid | prop | TT-A4 |  | seated sports spectator in a white sun hat and teal polo shirt, sitting on an invisible seat, clapping, generic person |
| `tennisFanB` | text-to-3d | P1 | humanoid | prop | TT-A4 |  | seated sports spectator in a navy windbreaker and cap, leaning forward on an invisible seat, generic person |
| `tennisFanC` | text-to-3d | P1 | humanoid | prop | TT-A4 |  | seated sports spectator in a terracotta summer dress and sunglasses, sitting on an invisible seat, generic person |
| `tennisFanD` | text-to-3d | P1 | humanoid | prop | TT-A4 |  | seated sports spectator in a racing green sweater, arms raised in a cheer, sitting on an invisible seat, generic person |
| `tennisStandArena` | text-to-3d | P2 | environment | background | TT-A3 |  | modular stadium seating section with navy tiered seats, steel railings and an access stair, for a floodlit hard court arena |
| `tennisStandGarden` | text-to-3d | P2 | environment | background | TT-A3 |  | modular grandstand section of racing green painted wood benches with clipped hedges along the front |
| `tennisStandClay` | text-to-3d | P2 | environment | background | TT-A3 |  | modular grandstand section of terracotta concrete terraces with folding seats and a low cream wall |
| `tennisStandDesert` | text-to-3d | P2 | environment | background | TT-A3 |  | modular grandstand section under a white tensile fabric canopy with sand-coloured seats |
| `tennisStandBeach` | text-to-3d | P2 | environment | background | TT-A3 |  | modular beach grandstand section built from bamboo poles and teak planks with striped cushions |
| `tennisLunarDome` | text-to-3d | P2 | environment | background | TT-W1 |  | small pressurised lunar habitat dome with ribbed white panels and a round airlock door |
| `tennisLunarLander` | text-to-3d | P2 | environment | background | TT-W1 |  | squat four-legged lunar lander with gold foil wrapping and a boxy descent stage |
| `tennisHydrangeaPlanter` | text-to-3d | P2 | prop | prop | TT-W1, TT-AN2 |  | square teak planter box overflowing with blue and pink hydrangea blooms |
| `tennisPalm` | text-to-3d | P2 | prop | prop | TT-W1, TT-AN2 |  | slender coconut palm tree with a curved trunk and a full crown of fronds |
| `tennisLifeguardTower` | text-to-3d | P2 | environment | background | TT-W1 |  | wooden lifeguard tower on stilts with a small hut, ramp and a red rescue float |
| `tennisCooler` | text-to-3d | P2 | prop | prop | TT-W1 |  | courtside drinks cooler chest in teal plastic with a white lid and handles |
| `tennisFlowerBox` | text-to-3d | P2 | prop | prop | TT-W1 |  | long painted window flower box with white daisies and trailing ivy |

## G02 roadster-rush (prefix `apex`)

Style: near-future elevated skyway at blue-hour sunset, charcoal, tangerine and cobalt palette, brushed steel, tinted glass, carbon composite and glossy automotive paint.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `apexHeroCobalt` | retexture | P1 | vehicle | vehicle | AO-M1 | `apps/showcase-roadster-rush/src/assets/meshy/hero.glb` | cobalt blue metallic sports car paint with a single tangerine racing stripe, dark tinted glass, satin black trim and chrome details, glowing cyan underglow strip |
| `apexRivalInterceptor` | text-to-3d | P1 | vehicle | vehicle | AO-A2 |  | near-future sky-lane interceptor car in red and graphite with four ducted lift fans, aggressive wedge body and red light strips |
| `apexTowerA` | text-to-3d | P1 | environment | background | AO-A1 |  | slender glass skyscraper top with stepped setbacks, cobalt-tinted curtain wall and a lit crown |
| `apexTowerB` | text-to-3d | P1 | environment | background | AO-A1 |  | twisting glass tower top with diagonal steel bracing and warm lit floors |
| `apexTowerC` | text-to-3d | P1 | environment | background | AO-A1 |  | angular glass tower top with a sloped roof garden and an antenna mast |
| `apexDeckPylon` | text-to-3d | P1 | environment | background | AO-E2 |  | tall concrete and steel elevated highway support pylon with a hammerhead cap and inset service lights |
| `apexTrafficSedan` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/sedan.glb` | everyday four-door sedan, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficSuv` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/suv.glb` | family SUV, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficHatch` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/hatch.glb` | compact hatchback, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficTaxi` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/taxi.glb` | city taxi in plain yellow without signage, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficVan` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/van.glb` | delivery van in plain white, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficPickup` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/pickup.glb` | pickup truck, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficBus` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/bus.glb` | city bus in plain two-tone paint, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficBoxtruck` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/boxtruck.glb` | box truck with a plain cargo body, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexTrafficCarrier` | retexture | P2 | vehicle | vehicle | AO-M3 | `apps/showcase-roadster-rush/src/assets/meshy/carrier.glb` | car carrier truck, clean factory paint without blotches, glossy clearcoat, dark tinted glass, glowing red tail lamps and amber indicators |
| `apexInterchangeSpan` | text-to-3d | P2 | environment | background | AO-W1 |  | elevated highway interchange span segment with curved concrete deck, steel crash barriers and slim lamp posts |
| `apexBillboardFrame` | text-to-3d | P2 | environment | background | AO-W1 |  | freestanding steel billboard frame with a blank panel, catwalk and four spot lamps |

## G03 heatsink (prefix `thermal`)

Style: foundry megacity seen through heat, soot black, oxidised iron, molten amber and slag red, soot-blackened cast iron, riveted rusted steel and glowing molten seams.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `thermalArchIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkArch.9a90ebd4.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalTowerLIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkTowerL.48cef1cc.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalTowerTIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkTowerT.3e5f0a0c.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalTowerXIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkTowerX.69d0e56e.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalOverpassIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkOverpass.c6bb161f.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalBarrierIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkBarrierA.ac31de34.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalStatueIron` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkStatue.7ac4ef8a.glb` | soot-blackened cast iron with hammered texture, scorched edges and faint ember glow in the cracks |
| `thermalGantrySteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkGantryStart.7f73743e.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints |
| `thermalTunnelSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkTunnelFrame.1678ba89.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints |
| `thermalBillboardSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkHoloBillboard.d3d7edc7.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints |
| `thermalRingSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkCheckpointRing.67ee1db8.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints |
| `thermalCanisterSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkCoolingCanister.0199c8d5.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints, coolant cyan window strip kept |
| `thermalBarrelSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkExplosiveBarrel.543538b2.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints, hazard amber band |
| `thermalEmitterSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkWaterEmitter.7721726f.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints |
| `thermalLavaFallSteel` | retexture | P1 | environment | background | HS-08 | `public/aura-assets/heatsinkLavaFall.71c51eb3.glb` | riveted oxidised steel plates with rust streaks and glowing molten-amber seams along the joints, bright molten core |
| `thermalFinWall` | text-to-3d | P1 | environment | background | HS-09, HS-04 |  | long industrial heat-sink fin wall made of tall parallel cast iron blades on a concrete plinth |
| `thermalCoolingTower` | text-to-3d | P1 | environment | background | HS-09, HS-04 |  | hyperbolic concrete cooling tower with soot streaks and a glowing rim at the top |
| `thermalSmokestacks` | text-to-3d | P1 | environment | background | HS-09, HS-04 |  | cluster of three tall riveted steel smokestacks with ladders and banded platforms |
| `thermalLadleCrane` | text-to-3d | P1 | environment | background | HS-09 |  | foundry gantry crane carrying a huge glowing ladle of molten metal on chains |
| `thermalPipeOverpass` | text-to-3d | P1 | environment | background | HS-09 |  | industrial pipe bridge with bundled insulated pipes on steel trestles over a road |
| `thermalDeadPine` | text-to-3d | P1 | prop | prop | HS-09 |  | dead scorched pine tree with bare charred branches and ash-grey bark |
| `thermalWaterTower` | text-to-3d | P1 | environment | background | HS-09, HS-04 |  | riveted steel water tower on four legs with a conical roof and rust streaks |
| `thermalAqueductArch` | text-to-3d | P1 | environment | background | HS-09 |  | massive industrial aqueduct arch of soot-stained brick with an iron channel on top |
| `thermalCrystalSpire` | text-to-3d | P1 | environment | background | HS-09 |  | tall cluster of dark mineral crystal spires with glowing violet veins rising from slag |
| `thermalCausewayPylon` | text-to-3d | P1 | environment | background | HS-09 |  | heavy causeway support pylon of riveted iron and concrete with a glowing warning lamp |
| `thermalReactorRing` | text-to-3d | P1 | environment | background | HS-09 |  | huge circular reactor ring frame on a pedestal with coolant pipes and amber vents |
| `thermalDroneOrion` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneOrion.988f172d.glb` | racing drone livery in burnt orange #d2561c clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneVolt` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneVolt.f1825d10.glb` | racing drone livery in electric blue #1f9dff clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneBastion` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneBastion.6a09c499.glb` | racing drone livery in deep royal blue #1438df clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneSpectre` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneSpectre.f66809c1.glb` | racing drone livery in dusty rose #d999ad clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneRazor` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneRazor.2f28a258.glb` | racing drone livery in crimson magenta #ad1060 clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneNighthawk` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneNighthawk.8113ba27.glb` | racing drone livery in deep plum #611a78 clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |
| `thermalDroneWraith` | retexture | P2 | vehicle | vehicle | HS-10 | `public/aura-assets/heatsinkDroneWraith.c0a00195.glb` | racing drone livery in teal #0d8ca8 clearcoat lacquer with dark carbon panels and glowing amber thruster nozzles |

## G04 teleoperator (prefix `dispatch`)

Style: cool bay-city avenue at marine dusk, slate-teal fog tones, warm sodium amber lamps, red and brass accents, painted cast iron, weathered concrete and wet asphalt.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `dispatchPodPearl` | retexture | P1 | vehicle | vehicle | GD-12, GD-11 | `public/aura-assets/teleopVehRobotaxi.f1726137.glb` | pearl white clearcoat autonomous pod car, dark smoked glass canopy, black sensor dome on the roof, thin glowing teal fare strip along the side |
| `dispatchFacadeVictorian` | retexture | P1 | environment | background | GD-12, GD-02 | `public/aura-assets/teleopBldg_victorian.39183fbd.glb` | painted wooden bay-window townhouse facade in muted slate-teal and cream with warm lit windows and dark wet trim |
| `dispatchFacadeMidrise` | retexture | P1 | environment | background | GD-12, GD-02 | `public/aura-assets/teleopBldg_midrise.900faa17.glb` | weathered concrete midrise facade with brass window frames and warm lit windows |
| `dispatchFacadeGlass` | retexture | P1 | environment | background | GD-12, GD-02 | `public/aura-assets/teleopBldg_glasstower.6338509c.glb` | blue-grey glass office facade with slim steel mullions and a few warm lit floors |
| `dispatchFacadeArtDeco` | retexture | P1 | environment | background | GD-12, GD-02 | `public/aura-assets/teleopBldg_artdeco.9b8dc08f.glb` | cream stone stepped art-deco facade with brass trim and warm lit windows |
| `dispatchTrafficSedan` | retexture | P1 | vehicle | vehicle | GD-03 | `public/aura-assets/teleopVehSedan.431efea6.glb` | muted satin grey sedan with clearcoat, dark glass and bright red rear tail lamps with a separate brake bar |
| `dispatchTrafficVan` | retexture | P1 | vehicle | vehicle | GD-03 | `public/aura-assets/teleopVehVan.6e9c71d7.glb` | muted sage delivery van with clearcoat, dark glass and bright red rear tail lamps |
| `dispatchTrafficHatch` | retexture | P1 | vehicle | vehicle | GD-03 | `public/aura-assets/teleopVehHatch.53933015.glb` | muted navy hatchback with clearcoat, dark glass and bright red rear tail lamps |
| `dispatchStreetLamp` | text-to-3d | P1 | prop | prop | GD-12, GD-02 |  | ornate cast iron street lamp post with a glass lantern head and fluted pole, painted dark green |
| `dispatchStreetTreeA` | text-to-3d | P1 | prop | prop | GD-12 |  | young plane tree in a square iron tree grate with a full rounded canopy |
| `dispatchStreetTreeB` | text-to-3d | P1 | prop | prop | GD-12 |  | slim coastal cypress street tree in a round planter with windswept foliage |
| `dispatchSignalMast` | text-to-3d | P1 | prop | prop | GD-12 |  | city traffic signal mast arm with two hanging three-lamp signal heads and a pedestrian signal |
| `dispatchPyramidTower` | text-to-3d | P1 | environment | background | GD-12 |  | tall tapering four-sided white office tower with a pointed crown and narrow side wings |
| `dispatchGlassTower` | text-to-3d | P1 | environment | background | GD-12 |  | modern blue glass high-rise with rounded corners and a crown of fins |
| `dispatchBridgeTower` | text-to-3d | P1 | environment | background | GD-12 |  | tall red-painted steel suspension bridge tower with two legs, stepped cross braces and cable saddles |
| `dispatchBridgeDeck` | text-to-3d | P1 | environment | background | GD-12 |  | suspension bridge deck segment with a steel truss underside, roadway and slim hanger cables |
| `dispatchBuildingA` | text-to-3d | P1 | environment | background | GD-12 |  | four-storey corner apartment building with bay windows, a ground-floor cafe awning and fire escapes |
| `dispatchBuildingB` | text-to-3d | P1 | environment | background | GD-12 |  | narrow brick warehouse loft building with arched windows, a roof water tank and roller doors |
| `dispatchPassenger` | text-to-3d | P1 | humanoid | character | GD-12, GD-16 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, commuter in a slate-teal raincoat with a shoulder bag |
| `dispatchPedestrianA` | text-to-3d | P2 | humanoid | character | GD-16 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, office worker in a grey suit and scarf |
| `dispatchPedestrianB` | text-to-3d | P2 | humanoid | character | GD-16 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, student in a mustard hoodie, jeans and sneakers |
| `dispatchPassengerRig` | rig | P2 | humanoid | character | GD-16 | after `dispatchPassenger` | height 1.72 m |
| `dispatchPedestrianARig` | rig | P2 | humanoid | character | GD-16 | after `dispatchPedestrianA` | height 1.78 m |
| `dispatchPedestrianBRig` | rig | P2 | humanoid | character | GD-16 | after `dispatchPedestrianB` | height 1.68 m |
| `dispatchPassengerAnim` | animate | P2 | humanoid | character | GD-16 | after `dispatchPassengerRig` | idle=0, wave=28 |
| `dispatchPedestrianAAnim` | animate | P2 | humanoid | character | GD-16 | after `dispatchPedestrianARig` | idle=11, phone=50 |
| `dispatchPedestrianBAnim` | animate | P2 | humanoid | character | GD-16 | after `dispatchPedestrianBRig` | idle=12, text=122 |
| `dispatchBusShelter` | text-to-3d | P2 | prop | prop | GD-19 |  | glass and green steel bus shelter with a bench and a blank map panel |
| `dispatchHydrant` | text-to-3d | P2 | prop | prop | GD-19 |  | squat cast iron fire hydrant painted white with a cap chain |
| `dispatchNewsBox` | text-to-3d | P2 | prop | prop | GD-19 |  | metal newspaper vending box on a pedestal with a blank window, painted dark blue |
| `dispatchCatenaryPole` | text-to-3d | P2 | prop | prop | GD-19 |  | tall cable-car catenary pole with a curved bracket arm and insulators |

## G05 iron-crown (prefix `crown`)

Style: theatrical royal forge tournament, black iron, molten gold and ember crimson, hammered iron, gilded trim, scorched stone and smoked leather, dramatic hero prop.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `crownBrazierPylon` | text-to-3d | P1 | prop | prop | IC47-A1 |  | tall black iron brazier pillar with a wide bowl of glowing embers and gold banding |
| `crownForgeAnvil` | text-to-3d | P1 | prop | prop | IC47-A1 |  | heavy blacksmith anvil on a scorched oak stump with hammers and tongs leaning against it |
| `crownWeaponRack` | text-to-3d | P1 | prop | prop | IC47-A1 |  | iron weapon rack holding blunt practice swords, spears and a round shield |
| `crownGildedThrone` | text-to-3d | P1 | prop | prop | IC47-A1 |  | tall black iron throne with gold filigree and a crimson velvet seat |
| `crownBannerStand` | text-to-3d | P1 | prop | prop | IC47-A1 |  | iron banner stand with a long crimson and gold cloth banner bearing a plain crown emblem |
| `crownChainedCauldron` | text-to-3d | P1 | prop | prop | IC47-A1 |  | large iron cauldron hanging from chains on a tripod over glowing coals |
| `crownRooftopAntenna` | text-to-3d | P1 | prop | prop | IC47-A1 |  | rooftop antenna tower with dishes, cables and red aircraft warning lights |
| `crownSignFrame` | text-to-3d | P1 | prop | prop | IC47-A1 |  | rooftop steel sign frame with a blank glowing magenta panel and maintenance ladder |
| `crownHelipadLight` | text-to-3d | P1 | prop | prop | IC47-A1 |  | low helipad edge light housing in black iron with a warm amber lens |
| `crownRooftopHvac` | text-to-3d | P1 | prop | prop | IC47-A1 |  | bulky rooftop air conditioning unit with fan grilles, rain streaks and pipes |
| `crownRainLantern` | text-to-3d | P1 | prop | prop | IC47-A1 |  | wrought iron street lantern on a short post with a glowing amber glass box |
| `crownDockBollard` | text-to-3d | P1 | prop | prop | IC47-A1 |  | black iron mooring bollard with a coiled thick rope around it |
| `crownCargoCrate` | text-to-3d | P1 | prop | prop | IC47-A1 |  | reinforced wooden cargo crate with iron corner brackets and stencilled bands |
| `crownRopeBarrel` | text-to-3d | P1 | prop | prop | IC47-A1 |  | oak barrel bound with iron hoops and a coil of rope on top |
| `crownHarbourCrane` | text-to-3d | P1 | environment | background | IC47-A1 |  | old riveted harbour crane with a lattice boom and a hook block |
| `crownFishingBoat` | text-to-3d | P1 | environment | background | IC47-A1 |  | small wooden fishing boat with a cabin, nets and a lantern on the mast |
| `crownArenaColumn` | text-to-3d | P1 | prop | prop | IC47-A1 |  | weathered sandstone arena column with a gilded capital, chipped and dusty |
| `crownWarriorStatue` | text-to-3d | P1 | prop | prop | IC47-A1 |  | bronze statue of an armoured warrior holding a raised sword on a stone plinth, generic figure |
| `crownSandBarrier` | text-to-3d | P1 | prop | prop | IC47-A1 |  | low curved sandstone arena barrier with iron rings and dust |
| `crownWeaponCart` | text-to-3d | P1 | prop | prop | IC47-A1 |  | wooden two-wheeled cart loaded with practice weapons and a crimson cloth |
| `crownFuelTank` | text-to-3d | P1 | prop | prop | IC47-A1 |  | squat cylindrical aviation fuel tank on a steel cradle with gauges and a hose |
| `crownHangarPlane` | text-to-3d | P1 | environment | background | IC47-A1 |  | vintage twin-propeller cargo plane with a dull silver fuselage, generic and unmarked |
| `crownRadarDish` | text-to-3d | P1 | prop | prop | IC47-A1 |  | rotating airfield radar dish on a lattice mast with a small control box |
| `crownBeaconPost` | text-to-3d | P1 | prop | prop | IC47-A1 |  | airfield beacon post with a rotating amber lamp on a striped pole |
| `crownStoneLantern` | text-to-3d | P1 | prop | prop | IC47-A1 |  | snow-dusted carved stone lantern with a glowing window |
| `crownPrayerBell` | text-to-3d | P1 | prop | prop | IC47-A1 |  | large bronze temple bell hanging in a carved wooden frame with snow on the roof |
| `crownSnowPine` | text-to-3d | P1 | prop | prop | IC47-A1 |  | snow-laden mountain pine tree with dark needles and a crooked trunk |
| `crownMountainBoulder` | text-to-3d | P1 | prop | prop | IC47-A1 |  | frost-covered granite boulder with lichen and a snow cap |
| `crownTempleGate` | text-to-3d | P1 | environment | background | IC47-A1 |  | carved wooden temple gate with a curved tiled roof dusted with snow |
| `crownShrine` | text-to-3d | P1 | environment | background | IC47-A2 |  | small mountain shrine hall with a tiled roof, wooden pillars and stone steps, simple solid shapes |
| `crownHall` | text-to-3d | P1 | environment | background | IC47-A2 |  | monastery hall with a sweeping tiled roof and red pillars, simple solid shapes |
| `crownTowerA` | text-to-3d | P1 | environment | background | IC47-A2 |  | tall square watchtower of dark stone with an iron balcony, simple solid shapes |
| `crownTowerB` | text-to-3d | P1 | environment | background | IC47-A2 |  | slender pagoda-like tower with five stacked roofs, simple solid shapes |
| `crownBackdropRidge` | text-to-3d | P1 | environment | background | IC47-W1 |  | long jagged mountain ridge backdrop piece with snowy peaks |
| `crownBackdropWall` | text-to-3d | P1 | environment | background | IC47-W1 |  | curved section of a massive fortress wall ring with crenellations and torches |
| `crownSkylineBlockA` | text-to-3d | P1 | environment | background | IC47-W1 |  | block of dark city skyline buildings with lit windows and rooftop tanks |
| `crownSkylineBlockB` | text-to-3d | P1 | environment | background | IC47-W1 |  | cluster of aircraft hangars with curved roofs and floodlights |
| `crownSkylineBlockC` | text-to-3d | P1 | environment | background | IC47-W1 |  | row of waterfront warehouses with moored river boats |
| `crownSpectatorA` | text-to-3d | P2 | humanoid | prop | IC47-W2 |  | standing tournament spectator cheering with both fists raised, dark cloak, generic person |
| `crownSpectatorB` | text-to-3d | P2 | humanoid | prop | IC47-W2 |  | standing tournament spectator clapping, leather jerkin and crimson scarf, generic person |
| `crownSpectatorC` | text-to-3d | P2 | humanoid | prop | IC47-W2 |  | standing tournament spectator pointing forward, hooded coat with gold trim, generic person |
| `crownLightTruss` | text-to-3d | P2 | environment | background | IC47-W2 |  | black iron stage lighting truss arch with hanging spotlights |
| `crownDais` | text-to-3d | P2 | environment | background | IC47-W2 |  | round stone fighting dais with gold inlay rings and low steps |
| `crownTauntF1` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a9a-de8f-759d-bf0f-c41e6ec51fb5 | taunt=88 (taunt clip for ironcrownBoulder on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |
| `crownTauntF2` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a9a-fee6-708f-8c60-8358c9e88c13 | taunt=88 (taunt clip for ironcrownJinx on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |
| `crownTauntF3` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a93-552b-71e6-aefa-61fcf5b0f32a | taunt=88 (taunt clip for ironcrownKenji on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |
| `crownTauntF4` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a9a-e5ee-74ba-837f-5cfad9905c50 | taunt=88 (taunt clip for ironcrownSeraph on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |
| `crownTauntF5` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a9b-121f-706c-bc2a-4ee22f84392f | taunt=88 (taunt clip for ironcrownSovereign on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |
| `crownTauntF6` | animate | P2 | humanoid | character | IC47-A3 | rig task 01a18a9a-ced2-73dc-b99e-b12cfd0bf65b | taunt=88 (taunt clip for ironcrownVolt on the IC-12 rig task; retarget onto the admitted skeleton with tools/iron-crown-clips/retarget-clips.mjs) |

## G06 pips-big-leap (prefix `leap`)

Style: hand-made felt-and-clay woodland miniature seen through a macro lens, moss green, toadstool red and birch cream with sun-seed gold accents, soft felt, sculpted clay, stitched fabric and painted wood.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `leapTileMossDisc` | text-to-3d | P1 | prop | prop | PBL-A1 |  | round platform tile of moss-covered felt on a thick clay disc, flat walkable top |
| `leapTileStump` | text-to-3d | P1 | prop | prop | PBL-A1 |  | platform tile shaped like a cut tree stump with felt rings on a flat walkable top |
| `leapTileMushroomCap` | text-to-3d | P1 | prop | prop | PBL-A1 |  | platform tile shaped like a wide toadstool cap, red felt with cream spots, flat top |
| `leapTileLilyPad` | text-to-3d | P1 | prop | prop | PBL-A1 |  | platform tile shaped like a felt lily pad with a notch, flat walkable top |
| `leapTileClayBrick` | text-to-3d | P1 | prop | prop | PBL-A1 |  | rectangular platform tile of stacked terracotta clay bricks with moss in the joints |
| `leapTileLeaf` | text-to-3d | P1 | prop | prop | PBL-A1 |  | platform tile shaped like a big stitched felt oak leaf, gently curled edges, flat top |
| `leapTileBarkPlank` | text-to-3d | P1 | prop | prop | PBL-A1 |  | long platform tile of rough bark planks tied with twine |
| `leapTileStoneSlab` | text-to-3d | P1 | prop | prop | PBL-A1 |  | flat river stone slab platform tile in grey clay with a felt moss edge |
| `leapTileBasaltHex` | text-to-3d | P1 | prop | prop | PBL-A1 |  | hexagonal basalt column platform tile in dark clay with glowing ember cracks |
| `leapTileCrystalShelf` | text-to-3d | P1 | prop | prop | PBL-A1 |  | platform tile of a clay shelf topped with pale amethyst crystals, flat top |
| `leapSparrow` | text-to-3d | P1 | prop | prop | PBL-A2 |  | small felt sparrow perched with folded wings, button eyes |
| `leapPinwheel` | text-to-3d | P1 | prop | prop | PBL-A2 |  | paper and wood pinwheel toy on a twig stick with red and cream blades |
| `leapEmberPot` | text-to-3d | P1 | prop | prop | PBL-A2 |  | small clay pot glowing with felt embers and a wisp of smoke |
| `leapRootColumn` | text-to-3d | P1 | prop | prop | PBL-A2 |  | twisted tree-root column made of sculpted clay with moss tufts |
| `leapFireflyJar` | text-to-3d | P1 | prop | prop | PBL-A2 |  | glass jar with a cork lid holding tiny glowing firefly lights |
| `leapTwigArch` | text-to-3d | P1 | prop | prop | PBL-A2 |  | arch woven from twigs and felt leaves with small red berries |
| `leapBerryHeart` | text-to-3d | P1 | prop | prop | PBL-A2 |  | heart-shaped cluster of glossy red clay berries on a leaf |
| `leapPaperStar` | text-to-3d | P1 | prop | prop | PBL-A2 |  | folded paper star ornament hanging from a thread, cream with gold edges |
| `leapAcornPadlock` | text-to-3d | P1 | prop | prop | PBL-A2 |  | padlock shaped like a golden acorn with a twig shackle |
| `leapBounceMushroom` | text-to-3d | P1 | prop | prop | PBL-A2 |  | springy bouncy mushroom with a squat cream stem and red felt cap |
| `leapStump` | text-to-3d | P1 | prop | prop | PBL-A2 |  | small mossy felt tree stump with a tiny door-like knot |
| `leapFlowerCluster` | text-to-3d | P1 | prop | prop | PBL-A2 |  | cluster of felt wildflowers with cream petals and yellow centres |
| `leapToadstoolCluster` | text-to-3d | P1 | prop | prop | PBL-A2 |  | cluster of three red-capped clay toadstools of different sizes |
| `leapPuffball` | text-to-3d | P1 | prop | prop | PBL-A2 |  | round cream puffball mushroom with soft felt texture |
| `leapAcornLantern` | text-to-3d | P1 | prop | prop | PBL-A2 |  | lantern made from a hollow acorn cap with a warm glowing bead inside |
| `leapBaseGarden` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base of a garden bed: felt soil, clay pebbles and grass edge, wide flat island |
| `leapBaseCanopy` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base of a forest floor with roots and fallen leaves, wide flat island |
| `leapBaseMillpond` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base with a felt pond edge, reeds and wet clay stones, wide flat island |
| `leapBaseMeadow` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base of a dandelion meadow with soft felt grass, wide flat island |
| `leapBaseCellar` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base of a basalt cellar floor with glowing lava cracks, wide flat island |
| `leapBaseHollow` | text-to-3d | P1 | environment | background | PBL-E1 |  | miniature diorama base of an amber hollow tree interior floor with bark walls, wide flat island |
| `leapClover` | text-to-3d | P1 | prop | prop | PBL-W1 |  | small clump of felt clover leaves |
| `leapGrassTuft` | text-to-3d | P1 | prop | prop | PBL-W1 |  | tuft of soft felt grass blades |
| `leapFern` | text-to-3d | P1 | prop | prop | PBL-W1 |  | curled felt fern frond cluster |
| `leapPebbles` | text-to-3d | P1 | prop | prop | PBL-W1 |  | handful of smooth clay pebbles in cream and grey |
| `leapLeafLitter` | text-to-3d | P1 | prop | prop | PBL-W1 |  | small pile of fallen felt leaves in amber and moss tones |
| `leapHedgehog` | text-to-3d | P2 | humanoid | character | PBL-A3 |  | friendly bipedal hedgehog villager in a knitted vest, standing upright in an A-pose with arms away from the body, felt and clay toy style, full body |
| `leapBeetle` | text-to-3d | P2 | humanoid | character | PBL-A3 |  | bipedal beetle headmaster in a tiny waistcoat with spectacles, standing upright in an A-pose with arms away from the body, felt and clay toy style, full body |
| `leapHedgehogRig` | rig | P2 | humanoid | character | PBL-A3 | after `leapHedgehog` | height 0.9 m |
| `leapBeetleRig` | rig | P2 | humanoid | character | PBL-A3 | after `leapBeetle` | height 1 m |
| `leapHedgehogAnim` | animate | P2 | humanoid | character | PBL-A3 | after `leapHedgehogRig` | idle=0, wave=28, cheer=59 |
| `leapBeetleAnim` | animate | P2 | humanoid | character | PBL-A3 | after `leapBeetleRig` | idle=11, wave=290, cheer=49 |
| `leapPipRig` | rig | P2 | humanoid | character | PBL-A4 | `apps/showcase-pips-big-leap/public/aura-assets/pipsPip.fcd4256f.glb` | height 1 m (re-rig of the shipped Pip mesh so new clips exist; retarget onto the admitted skeleton like IC-12) |
| `leapPipAnim` | animate | P2 | humanoid | character | PBL-A4 | after `leapPipRig` | hurt=178, land=506, glide=501, fall=502 |
| `leapLeafCape` | text-to-3d | P2 | prop | prop | PBL-A4 |  | small cape made from a single stitched felt maple leaf with a twig clasp |
| `leapLandmarkHollowOak` | text-to-3d | P2 | environment | background | PBL-A5 |  | huge hollow oak tree with a round doorway and felt moss, diorama landmark |
| `leapLandmarkMillWheel` | text-to-3d | P2 | environment | background | PBL-A5 |  | wooden mill wheel on a clay mill house with a felt stream, diorama landmark |
| `leapLandmarkDandelion` | text-to-3d | P2 | environment | background | PBL-A5 |  | giant dandelion spire with a fluffy seed head on a tall stem, diorama landmark |
| `leapLandmarkChimney` | text-to-3d | P2 | environment | background | PBL-A5 |  | basalt clay chimney with a glowing lava fall pouring down its side, diorama landmark |
| `leapLandmarkThroneTree` | text-to-3d | P2 | environment | background | PBL-A5 |  | tree trunk wall carved into an amber throne with root steps, diorama landmark |
| `leapLandmarkMoonTree` | text-to-3d | P2 | environment | background | PBL-A5 |  | pale crystal tree with glowing moon-white blossoms, diorama landmark |
| `leapConiferFelt` | retexture | P3 | prop | prop | PBL-A6 | `public/aura-assets/propConifer.ac8c8ab6.glb` | soft moss green wool felt with visible stitching and a clay brown trunk |
| `leapBoulderClay` | retexture | P3 | prop | prop | PBL-A6 | `public/aura-assets/propBoulder.a623d331.glb` | sculpted grey clay with fingerprints and small felt moss patches |
| `leapCrateFelt` | retexture | P3 | prop | prop | PBL-A6 | `public/aura-assets/gullsiegeCrateMeshy.d802d835.glb` | painted birch-cream wood with red felt corner patches and stitched edges |
| `leapBarrelClay` | retexture | P3 | prop | prop | PBL-A6 | `public/aura-assets/gullsiegeBarrelMeshy.240ded9a.glb` | toadstool red painted clay barrel with cream bands and felt moss |

## G07 aura-hoops-3d (prefix `blacktop`)

Style: summer-league streetball court at night, charcoal asphalt, sodium orange light and chain-link steel grey, galvanised steel, chipped paint, plywood and worn rubber, gritty urban.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `blacktopFloodlightRig` | retexture | P1 | prop | prop | H47-M2, H47-L2 | `public/aura-assets/hoopsFloodlight.23aef36e.glb` | galvanised steel floodlight with powder-coated lamp heads, warm sodium lenses glowing |
| `blacktopHoopRig` | retexture | P1 | prop | prop | H47-M2 | `public/aura-assets/hoopsHoopRig.b6d696b6.glb` | streetball hoop with a powder-coated orange rim, clear tempered glass backboard with white edge lines and galvanised pole without camo |
| `blacktopBallRubber` | retexture | P1 | prop | prop | H47-M2 | `public/aura-assets/hoopsBall.2aed886a.glb` | worn orange rubber basketball with black seams and a pebbled grip texture |
| `blacktopFanA` | text-to-3d | P1 | humanoid | character | H47-A1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, streetball fan in a charcoal hoodie and orange cap |
| `blacktopFanB` | text-to-3d | P1 | humanoid | character | H47-A1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, streetball fan in a white tank top and denim shorts |
| `blacktopFanC` | text-to-3d | P1 | humanoid | character | H47-A1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, streetball fan in an oversized green jersey and sneakers |
| `blacktopFanD` | text-to-3d | P1 | humanoid | character | H47-A1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, streetball fan in a yellow rain jacket and cargo pants |
| `blacktopFanARig` | rig | P1 | humanoid | character | H47-A1 | after `blacktopFanA` | height 1.78 m |
| `blacktopFanBRig` | rig | P1 | humanoid | character | H47-A1 | after `blacktopFanB` | height 1.7 m |
| `blacktopFanCRig` | rig | P1 | humanoid | character | H47-A1 | after `blacktopFanC` | height 1.85 m |
| `blacktopFanDRig` | rig | P1 | humanoid | character | H47-A1 | after `blacktopFanD` | height 1.66 m |
| `blacktopFanAPoses` | animate | P1 | humanoid | character | H47-A1 | after `blacktopFanARig` | sitCheer=300, sitClap=354, sitPump=304 |
| `blacktopFanBPoses` | animate | P1 | humanoid | character | H47-A1 | after `blacktopFanBRig` | sitCheer=300, sitClap=354, sitPump=304 |
| `blacktopFanCPoses` | animate | P1 | humanoid | character | H47-A1 | after `blacktopFanCRig` | sitCheer=300, sitClap=354, sitPump=304 |
| `blacktopFanDPoses` | animate | P1 | humanoid | character | H47-A1 | after `blacktopFanDRig` | sitCheer=300, sitClap=354, sitPump=304 |
| `blacktopBleacher` | text-to-3d | P1 | environment | background | H47-A1 |  | five-row aluminium bleacher with chipped paint and a rear railing |
| `blacktopCourtChair` | text-to-3d | P1 | prop | prop | H47-A1 |  | stackable plastic courtside chair with a steel frame, faded orange |
| `blacktopLightGantry` | text-to-3d | P1 | environment | background | H47-A1 |  | rusty steel light gantry spanning a court with four sodium lamp heads |
| `blacktopChainFence` | text-to-3d | P1 | prop | prop | H47-A2 |  | chain-link fence panel on galvanised posts with a bent top rail |
| `blacktopFenceGate` | text-to-3d | P1 | prop | prop | H47-A2 |  | chain-link fence gate with a padlocked latch and sagging hinges |
| `blacktopStoop` | text-to-3d | P1 | prop | prop | H47-A2 |  | brownstone walk-up stoop with stone steps and iron handrails |
| `blacktopMuralWall` | text-to-3d | P1 | environment | background | H47-A2 |  | freestanding brick wall section painted with a bold abstract mural of shapes and drips |
| `blacktopBoombox` | text-to-3d | P1 | prop | prop | H47-A2 |  | chunky retro portable stereo boombox with big speakers and a handle, unbranded |
| `blacktopLifeguardTower` | text-to-3d | P1 | environment | background | H47-A2 |  | weathered wooden beach lifeguard tower with a ramp and a striped awning |
| `blacktopParapet` | text-to-3d | P1 | environment | background | H47-A2 |  | rooftop parapet wall section with clay coping tiles and a vent pipe |
| `blacktopCorrugatedRoof` | text-to-3d | P1 | environment | background | H47-A2 |  | corrugated metal roof canopy on steel posts, rusted and rain-streaked |
| `blacktopBulbString` | text-to-3d | P1 | prop | prop | H47-A2 |  | string of warm tungsten festoon bulbs hanging between two poles |
| `blacktopNeonBox` | text-to-3d | P1 | prop | prop | H47-A2 |  | wall-mounted neon box sign with an abstract glowing magenta and cyan pattern, no letters |
| `blacktopUmbrella` | text-to-3d | P1 | prop | prop | H47-A2 |  | beach umbrella with faded orange and white stripes on a weighted base |
| `blacktopStationRib` | text-to-3d | P1 | environment | background | H47-A2 |  | curved orbital station structural rib with panels and blinking marker lights |
| `blacktopMaglevStanchion` | text-to-3d | P1 | environment | background | H47-A2 |  | sleek maglev rail stanchion with a glowing blue guide strip |
| `blacktopFountain` | text-to-3d | P1 | prop | prop | H47-A2 |  | steel drinking fountain on a concrete post |
| `blacktopTrashCan` | text-to-3d | P1 | prop | prop | H47-A2 |  | dented green metal city trash can with a domed lid |
| `blacktopBench` | text-to-3d | P1 | prop | prop | H47-A2 |  | concrete and wood park bench with graffiti scuffs |
| `blacktopHydrant` | text-to-3d | P1 | prop | prop | H47-A2 |  | red city fire hydrant with chipped paint |
| `blacktopCones` | text-to-3d | P1 | prop | prop | H47-A2 |  | stack of orange traffic cones with reflective bands |
| `blacktopScaffold` | text-to-3d | P1 | environment | background | H47-A2 |  | steel scaffold tower section with wooden planks and safety netting |
| `blacktopContainer` | text-to-3d | P1 | environment | background | H47-A2 |  | rusty blue shipping container with corrugated sides and doors |
| `blacktopVendingMachine` | text-to-3d | P1 | prop | prop | H47-A2 |  | glowing drinks vending machine with blank colourful panels, unbranded |
| `blacktopPalmPlanter` | text-to-3d | P1 | prop | prop | H47-A2 |  | short fan palm in a cracked concrete planter |
| `blacktopRainBarrel` | text-to-3d | P1 | prop | prop | H47-A2 |  | plastic rain barrel under a downpipe with water overflowing |
| `blacktopSpeakerStack` | text-to-3d | P1 | prop | prop | H47-A2 |  | stack of black sound speakers on a road case |
| `blacktopBikeRack` | text-to-3d | P1 | prop | prop | H47-A2 |  | galvanised bike rack with a chained city bike |
| `blacktopNet` | text-to-3d | P1 | prop | prop | H47-A2, H47-AN1 |  | white nylon basketball net hanging from a rim ring, loose mesh |

## G08 aura-diamond-3d (prefix `ballpark`)

Style: warm broadcast-TV summer baseball postcard, turf green, terracotta clay and chalk white, painted wood, weathered brick, galvanised steel and sun-faded canvas, nostalgic film stock.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `ballparkFanA` | text-to-3d | P1 | humanoid | prop | DIA-A2 |  | seated baseball fan in a cream jersey and cap holding a foam finger, sitting on an invisible seat, generic person |
| `ballparkFanB` | text-to-3d | P1 | humanoid | prop | DIA-A2 |  | seated baseball fan in a terracotta t-shirt eating from a paper tray, sitting on an invisible seat, generic person |
| `ballparkFanC` | text-to-3d | P1 | humanoid | prop | DIA-A2 |  | standing baseball fan in a green windbreaker cheering with both arms up, generic person |
| `ballparkFanD` | text-to-3d | P1 | humanoid | prop | DIA-A2 |  | seated baseball fan in a striped shirt with a scorecard and pencil, sitting on an invisible seat, generic person |
| `ballparkHarborPine` | text-to-3d | P1 | prop | prop | DIA-A1 |  | tall coastal pine with a windswept flat crown |
| `ballparkLighthouse` | text-to-3d | P1 | environment | background | DIA-A1 |  | white and terracotta striped lighthouse on a rocky base with a lantern room |
| `ballparkBoat` | text-to-3d | P1 | prop | prop | DIA-A1 |  | small wooden harbour sailboat moored with furled sail |
| `ballparkBoardwalkStand` | text-to-3d | P1 | prop | prop | DIA-A1 |  | wooden boardwalk snack stand with a striped awning and blank menu board |
| `ballparkHoodoo` | text-to-3d | P1 | environment | background | DIA-A1 |  | tall red sandstone hoodoo rock spire with a balanced cap stone |
| `ballparkMesa` | text-to-3d | P1 | environment | background | DIA-A1 |  | flat-topped desert mesa with layered red and ochre strata |
| `ballparkMesquite` | text-to-3d | P1 | prop | prop | DIA-A1 |  | gnarled desert mesquite tree with feathery leaves |
| `ballparkWaterTower` | text-to-3d | P1 | environment | background | DIA-A1 |  | wooden rooftop water tower on a steel stand with hoops |
| `ballparkHvac` | text-to-3d | P1 | prop | prop | DIA-A1 |  | rooftop HVAC unit with fans and ducts |
| `ballparkSignFrame` | text-to-3d | P1 | environment | background | DIA-A1 |  | rooftop steel sign frame with a blank lit panel |
| `ballparkBrickFacade` | text-to-3d | P1 | environment | background | DIA-A1 |  | ivy-covered red brick ballpark facade wall with arched windows |
| `ballparkManualScoreboard` | text-to-3d | P1 | environment | background | DIA-A1 |  | old green hand-operated scoreboard with blank number plates and a small clock |
| `ballparkRowhouseRoof` | text-to-3d | P1 | environment | background | DIA-A1 |  | row of brick rowhouse rooftops with chimneys and fire escapes |
| `ballparkDomeTruss` | text-to-3d | P1 | environment | background | DIA-A1 |  | curved steel roof truss segment of an indoor stadium dome with catwalk lights |
| `ballparkLedBoard` | text-to-3d | P1 | prop | prop | DIA-A1 |  | large blank LED video board on a steel frame |
| `ballparkHabitat` | text-to-3d | P1 | environment | background | DIA-A1 |  | lunar habitat module with white panels, round windows and solar wings |
| `ballparkBoulders` | text-to-3d | P1 | prop | prop | DIA-A1 |  | cluster of grey lunar regolith boulders with fine dust |
| `ballparkAntenna` | text-to-3d | P1 | prop | prop | DIA-A1 |  | tall lunar communications antenna mast with a dish |
| `ballparkBall` | text-to-3d | P2 | prop | prop | DIA-A3 |  | regulation baseball with clean white leather and red stitched seams, simple low-poly shape |
| `ballparkAthleteHome` | retexture | P2 | humanoid | character | DIA-A3 | `public/aura-assets/diamondAthleteClean.43c2d5ab.glb` | baseball home uniform in cream with turf green pinstripes and cap, terracotta socks, matte cotton |
| `ballparkAthleteRoad` | retexture | P2 | humanoid | character | DIA-A3 | `public/aura-assets/diamondAthleteClean.43c2d5ab.glb` | baseball road uniform in slate grey with terracotta trim and cap, matte cotton |

## G09 aura-fc-3d (prefix `pitch`)

Style: European broadcast night football in weather, storm navy, wet emerald and cold white with lime accents, wet painted steel, polycarbonate and concrete.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `pitchStandModule` | text-to-3d | P1 | environment | background | FC47-A1 |  | modular football stadium stand section with navy seats, steel roof cantilever and floodlit edge |
| `pitchDugout` | text-to-3d | P1 | prop | prop | FC47-A1 |  | football team dugout with a curved polycarbonate roof and padded seats |
| `pitchLedBoard` | text-to-3d | P1 | prop | prop | FC47-A1 |  | pitch-side LED advertising board segment with a blank glowing panel |
| `pitchBroadcastCamera` | text-to-3d | P1 | prop | prop | FC47-A1 |  | broadcast TV camera on a tripod with a long lens and rain cover |
| `pitchPlayerTunnel` | text-to-3d | P1 | environment | background | FC47-A1 |  | inflatable player tunnel entrance with a steel frame and rain-wet canopy |
| `pitchGoalFrame` | text-to-3d | P1 | prop | prop | FC47-A1 |  | full-size football goal frame with white posts and a net |
| `pitchFanA` | text-to-3d | P1 | humanoid | character | FC47-A1, FC47-AN1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, football supporter in a navy rain jacket and lime scarf |
| `pitchFanB` | text-to-3d | P1 | humanoid | character | FC47-A1, FC47-AN1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, football supporter in a white jersey and beanie |
| `pitchFanC` | text-to-3d | P1 | humanoid | character | FC47-A1, FC47-AN1 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, football supporter in a hooded green parka |
| `pitchFanARig` | rig | P2 | humanoid | character | FC47-AN1 | after `pitchFanA` | height 1.8 m |
| `pitchFanBRig` | rig | P2 | humanoid | character | FC47-AN1 | after `pitchFanB` | height 1.72 m |
| `pitchFanCRig` | rig | P2 | humanoid | character | FC47-AN1 | after `pitchFanC` | height 1.76 m |
| `pitchFanAAnim` | animate | P2 | humanoid | character | FC47-AN1 | after `pitchFanARig` | idle=0, cheer=298, pump=403 |
| `pitchFanBAnim` | animate | P2 | humanoid | character | FC47-AN1 | after `pitchFanBRig` | idle=11, cheer=303, pump=59 |
| `pitchFanCAnim` | animate | P2 | humanoid | character | FC47-AN1 | after `pitchFanCRig` | idle=12, cheer=306, pump=49 |
| `pitchHillHouses` | text-to-3d | P2 | environment | background | FC47-A2 |  | cluster of stacked hillside brick houses with flat roofs and water tanks |
| `pitchLightPole` | text-to-3d | P2 | prop | prop | FC47-A2 |  | tall street light pole with a sodium lamp and tangled wires |
| `pitchPalm` | text-to-3d | P2 | prop | prop | FC47-A2 |  | tall coastal palm tree with a slight lean |
| `pitchLifeguardTower` | text-to-3d | P2 | environment | background | FC47-A2 |  | elevated beach lifeguard tower with a red roof |
| `pitchBoat` | text-to-3d | P2 | prop | prop | FC47-A2 |  | colourful wooden fishing boat pulled up on sand |
| `pitchLanterns` | text-to-3d | P2 | prop | prop | FC47-A2 |  | string of red paper lanterns on a wooden frame |
| `pitchShrineGate` | text-to-3d | P2 | environment | background | FC47-A2 |  | red lacquered shrine gate with two pillars and curved crossbeams |
| `pitchCherryTree` | text-to-3d | P2 | prop | prop | FC47-A2 |  | cherry blossom tree in full pink bloom |
| `pitchIceRidge` | text-to-3d | P2 | environment | background | FC47-A2 |  | jagged glacier ice ridge with blue crevasses and snow |
| `pitchSaltCone` | text-to-3d | P2 | prop | prop | FC47-A2 |  | conical pile of harvested white salt on a mirror flat |
| `pitchIceCrystals` | text-to-3d | P2 | prop | prop | FC47-A2 |  | cluster of tall translucent ice crystals |
| `pitchDomeFrost` | retexture | P2 | environment | background | FC47-A2 | `public/aura-assets/fcGlacierDomeMeshy.32b82759.glb` | frosted translucent white dome panels with ice crystals on steel ribs and cold blue rim lights |
| `pitchSteward` | text-to-3d | P3 | humanoid | prop | FC47-W1 |  | stadium steward in a hi-vis lime vest over a navy rain jacket, standing, generic person |
| `pitchPhotographer` | text-to-3d | P3 | humanoid | prop | FC47-W1 |  | pitch-side photographer kneeling with a large camera and rain cape, generic person |

## G10 aura-links-3d (prefix `golf`)

Style: golf broadcast postcard landscape in natural light, weathered timber, dry stone, painted steel and natural foliage, calm and premium.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `golfMarram` | text-to-3d | P1 | prop | prop | LINKS-07 |  | clump of tall pale marram dune grass blowing in the wind |
| `golfGorse` | text-to-3d | P1 | prop | prop | LINKS-07 |  | rounded gorse bush with yellow flowers and dark green spines |
| `golfMapleA` | text-to-3d | P1 | prop | prop | LINKS-07 |  | broad maple tree in warm autumn orange foliage |
| `golfMapleB` | text-to-3d | P1 | prop | prop | LINKS-07 |  | tall maple tree with red and gold autumn leaves |
| `golfMapleC` | text-to-3d | P1 | prop | prop | LINKS-07 |  | young maple tree with mixed green and amber leaves |
| `golfBirch` | text-to-3d | P1 | prop | prop | LINKS-07 |  | slender white birch tree with yellow leaves |
| `golfCharredTree` | text-to-3d | P1 | prop | prop | LINKS-07 |  | volcanic charred tree trunk with glowing ember cracks |
| `golfMountainPine` | text-to-3d | P1 | prop | prop | LINKS-07 |  | dense mountain pine tree clinging to rock |
| `golfNeonPalm` | text-to-3d | P1 | prop | prop | LINKS-07 |  | palm tree with fronds edged by glowing teal and magenta light strips |
| `golfLighthouse` | text-to-3d | P1 | environment | background | LINKS-08 |  | white lighthouse with a red cap on a dune headland |
| `golfClubhouse` | text-to-3d | P1 | environment | background | LINKS-08 |  | timber clubhouse with a veranda, gabled roof and warm windows |
| `golfBasaltColumns` | text-to-3d | P1 | environment | background | LINKS-08 |  | cluster of tall hexagonal basalt columns on a crater rim |
| `golfCableCarStation` | text-to-3d | P1 | environment | background | LINKS-08 |  | mountain cable-car station with a cabin and cable wheel |
| `golfHarbourCrane` | text-to-3d | P1 | environment | background | LINKS-08 |  | harbour container crane with glowing teal and magenta lights |
| `golfLander` | text-to-3d | P1 | environment | background | LINKS-08 |  | lunar lander with gold foil and four legs on regolith |
| `golfBall` | text-to-3d | P1 | prop | prop | LINKS-08 |  | white golf ball with a clean dimpled surface |
| `golfDyke` | text-to-3d | P2 | environment | background | LINKS-09 |  | low grassy sea dyke with a stone revetment |
| `golfStarterHut` | text-to-3d | P2 | prop | prop | LINKS-09 |  | small wooden starter hut with a slate roof and flag pole |
| `golfFootbridge` | text-to-3d | P2 | prop | prop | LINKS-09 |  | arched timber footbridge over a stream |
| `golfCalderaRidge` | text-to-3d | P2 | environment | background | LINKS-09 |  | dark volcanic caldera ridge with lava glow in fissures |
| `golfFumarole` | text-to-3d | P2 | prop | prop | LINKS-09 |  | steaming volcanic fumarole vent with sulphur crust |
| `golfPrayerFlags` | text-to-3d | P2 | prop | prop | LINKS-09 |  | line of colourful prayer flags strung between poles |
| `golfSkylineBackdrop` | text-to-3d | P2 | environment | background | LINKS-16 |  | harbour city skyline backdrop strip with lit towers at night |
| `golfLedLeaderboard` | text-to-3d | P2 | prop | prop | LINKS-16 |  | golf course LED leaderboard on a steel frame with blank rows |
| `golfFloodMast` | text-to-3d | P2 | prop | prop | LINKS-16 |  | tall floodlight mast with a lamp bank |
| `golfRegolithRock` | text-to-3d | P2 | prop | prop | LINKS-09 |  | grey regolith rock with fine dust and sharp edges |
| `golfEarthDisc` | text-to-3d | P2 | environment | background | LINKS-09 |  | planet Earth sphere with clouds and blue oceans |
| `golfTeeMarker` | text-to-3d | P2 | prop | prop | LINKS-09 |  | pair of wooden tee markers shaped like small posts |
| `golfBallWasher` | text-to-3d | P2 | prop | prop | LINKS-09 |  | golf ball washer on a post with a towel |
| `golfYardagePost` | text-to-3d | P2 | prop | prop | LINKS-09 |  | short painted yardage post with a blank plate |
| `golfSpectatorA` | text-to-3d | P2 | humanoid | character | LINKS-13 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, golf spectator in a quilted vest and flat cap |
| `golfSpectatorB` | text-to-3d | P2 | humanoid | character | LINKS-13 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, golf spectator in a pastel sweater and visor |
| `golfSpectatorC` | text-to-3d | P2 | humanoid | character | LINKS-13 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, golf spectator in a rain jacket holding a closed umbrella |
| `golfSpectatorARig` | rig | P2 | humanoid | character | LINKS-13 | after `golfSpectatorA` | height 1.76 m |
| `golfSpectatorBRig` | rig | P2 | humanoid | character | LINKS-13 | after `golfSpectatorB` | height 1.68 m |
| `golfSpectatorCRig` | rig | P2 | humanoid | character | LINKS-13 | after `golfSpectatorC` | height 1.8 m |
| `golfSpectatorAAnim` | animate | P2 | humanoid | character | LINKS-13 | after `golfSpectatorARig` | idle=0, clap=35, cheer=298 |
| `golfSpectatorBAnim` | animate | P2 | humanoid | character | LINKS-13 | after `golfSpectatorBRig` | idle=11, clap=299, cheer=49 |
| `golfSpectatorCAnim` | animate | P2 | humanoid | character | LINKS-13 | after `golfSpectatorCRig` | idle=12, clap=25, cheer=306 |
| `golfGolferMatte` | retexture | P2 | humanoid | character | LINKS-06 | `public/aura-assets/linksGolferAthleteClean.b56529b1.glb` | golfer outfit in matte cotton polo, twill trousers and leather golf shoes, natural muted colours, no gloss (skinned source: transplant the maps onto the rigged golfer (original UVs kept)) |

## G11 bunker-zero (prefix `bz`)

Style: buried Cold-War civil-defence bunker, board-formed concrete grey, olive drab steel and rust with hazard yellow-black accents only, chipped enamel paint and riveted steel.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `bzBlastDoor` | text-to-3d | P1 | environment | background | BZ-12 |  | massive round bunker blast door with a hand wheel and hinges, olive steel |
| `bzFreightElevator` | text-to-3d | P1 | environment | background | BZ-12 |  | freight elevator cage with a scissor gate and steel mesh walls |
| `bzPushWallPanel` | text-to-3d | P1 | environment | background | BZ-12 |  | riveted steel wall panel with hazard stripes and a pull handle |
| `bzConcretePillar` | text-to-3d | P1 | environment | background | BZ-12 |  | square board-formed concrete pillar with chipped corners and a painted number band |
| `bzCagedLamp` | text-to-3d | P1 | prop | prop | BZ-12 |  | caged tungsten bulb wall lamp with a steel guard |
| `bzFluorescentFixture` | text-to-3d | P1 | prop | prop | BZ-12 |  | long ceiling fluorescent tube fixture with a metal reflector |
| `bzAlarmBeacon` | text-to-3d | P1 | prop | prop | BZ-12 |  | red rotating alarm beacon light on a wall bracket |
| `bzPipeRun` | text-to-3d | P1 | prop | prop | BZ-12 |  | straight run of wall-mounted pipes with valves and brackets |
| `bzCableTray` | text-to-3d | P1 | prop | prop | BZ-12 |  | steel cable tray section full of bundled cables |
| `bzVentFan` | text-to-3d | P1 | prop | prop | BZ-12 |  | industrial wall vent fan in a square steel housing |
| `bzSandbags` | text-to-3d | P1 | prop | prop | BZ-12 |  | low curved wall of stacked burlap sandbags |
| `bzCabinet` | text-to-3d | P1 | prop | prop | BZ-12 |  | olive steel filing cabinet with dented drawers |
| `bzDesk` | text-to-3d | P1 | prop | prop | BZ-12 |  | mid-century steel office desk with a lamp and rotary telephone |
| `bzForgeGrate` | text-to-3d | P1 | prop | prop | BZ-12 |  | heavy iron floor grate over a glowing forge pit |
| `bzChains` | text-to-3d | P1 | prop | prop | BZ-12 |  | heavy iron chains hanging from a ceiling hook |
| `bzSmg` | text-to-3d | P1 | prop | prop | BZ-12 |  | generic mid-century submachine gun with a wooden stock and perforated barrel shroud, unmarked |
| `bzRocketTube` | text-to-3d | P1 | prop | prop | BZ-12 |  | generic olive shoulder-fired rocket launcher tube with a simple sight, unmarked |
| `bzTrenchKnife` | text-to-3d | P1 | prop | prop | BZ-12 |  | trench knife with a brass knuckle guard and blackened blade |
| `bzPistolBlued` | retexture | P1 | prop | prop | BZ-12 | `apps/showcase-bunker-zero/public/aura-assets/bzPistol.ee15a8b3.glb` | blued steel service pistol with worn edges and brown grip panels, unmarked |
| `bzAmmoCrateOlive` | retexture | P1 | prop | prop | BZ-12 | `apps/showcase-bunker-zero/public/aura-assets/bzCrateMeshy.a9944634.glb` | olive drab painted wooden ammunition crate with stencil-free bands and rope handles |
| `bzGuardRig` | rig | P1 | humanoid | character | BZ-11 | `apps/showcase-bunker-zero/public/aura-assets/bzGuardMeshy.010bba7b.glb` | height 1.8 m |
| `bzGunnerRig` | rig | P1 | humanoid | character | BZ-11 | `apps/showcase-bunker-zero/public/aura-assets/bzGunnerMeshy.f8ff70f5.glb` | height 1.82 m |
| `bzWardenRig` | rig | P1 | humanoid | character | BZ-11 | `apps/showcase-bunker-zero/public/aura-assets/bzWardenMeshy.2020cd5c.glb` | height 1.9 m |
| `bzGuardAnim` | animate | P1 | humanoid | character | BZ-11 | after `bzGuardRig` | idle=89, aimFire=104, hitReact=178, death=8 |
| `bzGunnerAnim` | animate | P1 | humanoid | character | BZ-11 | after `bzGunnerRig` | idle=89, aimFire=234, hitReact=177, death=183 |
| `bzWardenAnim` | animate | P1 | humanoid | character | BZ-11 | after `bzWardenRig` | idle=89, aimFire=104, hitReact=171, death=188 |
| `bzWardenCloth` | retexture | P2 | humanoid | character | BZ-14 | `apps/showcase-bunker-zero/public/aura-assets/bzWardenMeshy.2020cd5c.glb` | warden in a heavy olive wool greatcoat with leather belts, matte cloth, no glowing parts (skinned source: transplant the maps onto the rig) |

## G12 slingshot-siege (prefix `sling`)

Style: painted wooden toy siege diorama by the sea, chalk white, sea teal, bleached sand and driftwood with pennant red accents, hand-painted wood, chalky stone, rope and canvas.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `slingSeaStackIsland` | text-to-3d | P1 | environment | background | SS47-A1 |  | chalk sea-stack island diorama with grassy top, cliffs and a small beach, toy miniature |
| `slingBlockWood` | text-to-3d | P1 | prop | prop | SS47-A1, SS47-M1 |  | painted wooden toy building block, rectangular plank with rounded edges |
| `slingBlockStone` | text-to-3d | P1 | prop | prop | SS47-A1, SS47-M1 |  | chalky stone toy building block with chiselled edges |
| `slingBlockGlass` | text-to-3d | P1 | prop | prop | SS47-A1, SS47-M1 |  | clear glass toy building block with bevelled edges |
| `slingBlockIce` | text-to-3d | P1 | prop | prop | SS47-A1, SS47-M1 |  | pale frosted ice toy building block with soft glow |
| `slingBlockObsidian` | text-to-3d | P1 | prop | prop | SS47-A1, SS47-M1 |  | glossy black obsidian toy building block with sharp facets |
| `slingDebrisWood` | text-to-3d | P1 | prop | prop | SS47-A1 |  | handful of broken painted wood chips and splinters |
| `slingDebrisStone` | text-to-3d | P1 | prop | prop | SS47-A1 |  | handful of chalky stone rubble chips |
| `slingSlingshot` | text-to-3d | P1 | prop | prop | SS47-A1 |  | big wooden toy slingshot on a stand with a leather pouch and rope |
| `slingWindmillRotor` | text-to-3d | P1 | prop | prop | SS47-A1 |  | four-blade wooden windmill rotor with canvas sails |
| `slingClothPennant` | text-to-3d | P1 | prop | prop | SS47-A1 |  | triangular red cloth pennant on a short wooden pole |
| `slingLighthouseIslet` | text-to-3d | P1 | environment | background | SS47-A1 |  | tiny rocky islet with a white and red toy lighthouse |
| `slingQuarryCrane` | text-to-3d | P1 | environment | background | SS47-A1 |  | wooden quarry crane with a treadwheel and rope hook |
| `slingGreenhouseFrame` | text-to-3d | P1 | environment | background | SS47-A1 |  | small wooden greenhouse frame with glass panes |
| `slingCurtainWall` | text-to-3d | P1 | environment | background | SS47-A1 |  | chalk stone castle curtain wall section with crenellations |
| `slingCrystalCrater` | text-to-3d | P1 | environment | background | SS47-A1 |  | small crater filled with glowing teal crystals |
| `slingDuneGrass` | text-to-3d | P1 | prop | prop | SS47-W1 |  | tuft of beach dune grass |
| `slingShells` | text-to-3d | P1 | prop | prop | SS47-W1 |  | small pile of sea shells and pebbles |
| `slingDriftwood` | text-to-3d | P1 | prop | prop | SS47-W1 |  | bleached driftwood log with knots |
| `slingRopePost` | text-to-3d | P1 | prop | prop | SS47-W1 |  | short wooden post with coiled rope |
| `slingLobsterPot` | text-to-3d | P1 | prop | prop | SS47-W1 |  | wooden slat lobster pot with netting and a buoy |
| `slingCatapultToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeCatapultMeshy.d6a37204.glb` | toy catapult, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |
| `slingWatchtowerToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeWatchtowerMeshy.546ee761.glb` | toy watchtower, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |
| `slingGatehouseToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeGatehouseMeshy.c54a43ad.glb` | toy gatehouse, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |
| `slingWindmillToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeWindmillMeshy.f4ebca18.glb` | toy windmill, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |
| `slingCrateToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeCrateMeshy.d802d835.glb` | toy crate, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |
| `slingBarrelToy` | retexture | P2 | prop | prop | SS47-A2 | `public/aura-assets/gullsiegeBarrelMeshy.240ded9a.glb` | toy barrel, one painted-toy style: hand-painted wood, chalk white, sea teal and pennant red |

## G13 dot-dash-3d (prefix `dotdash`)

Style: macro view of a powered circuit board at night under a warm desk lamp, solder-mask green, copper and silver with cyan LED glow, glossy solder mask, black epoxy and brushed metal.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `dotdashCourierPod` | text-to-3d | P1 | prop | prop | DD47-A1 |  | tiny courier pod robot with a glass dome, glowing cyan core and copper cooling fins |
| `dotdashSentryBeetle` | text-to-3d | P1 | prop | prop | DD47-A2 |  | small beetle-shaped bug-bot sentry with a rounded shell and LED eyes |
| `dotdashSentrySpider` | text-to-3d | P1 | prop | prop | DD47-A2 |  | small spider-legged bug-bot sentry with a flat body and antenna |
| `dotdashSentryCrab` | text-to-3d | P1 | prop | prop | DD47-A2 |  | small crab-like bug-bot sentry with pincers and a wide shell |
| `dotdashSentryMoth` | text-to-3d | P1 | prop | prop | DD47-A2 |  | small moth-winged bug-bot sentry with fan-shaped wings |
| `dotdashElectrolytic` | text-to-3d | P2 | prop | prop | DD47-A3, DD47-M3 |  | electrolytic capacitor can with a vented top and two leads |
| `dotdashCeramicCap` | text-to-3d | P2 | prop | prop | DD47-A3 |  | small ceramic disc capacitor with two bent leads |
| `dotdashToroid` | text-to-3d | P2 | prop | prop | DD47-A3 |  | toroid inductor with copper wire windings |
| `dotdashCrystalCan` | text-to-3d | P2 | prop | prop | DD47-A3 |  | crystal oscillator in a silver oval can |
| `dotdashHeatsink` | text-to-3d | P2 | prop | prop | DD47-A3 |  | finned aluminium heatsink block |
| `dotdashPinHeader` | text-to-3d | P2 | prop | prop | DD47-A3 |  | row of gold pin header pins in a black plastic strip |
| `dotdashQfpChip` | text-to-3d | P2 | prop | prop | DD47-A3 |  | black square QFP microchip with fine silver legs on four sides, unmarked |
| `dotdashRibbon` | text-to-3d | P2 | prop | prop | DD47-A3 |  | grey ribbon cable with a black connector |
| `dotdashSolderingIron` | text-to-3d | P2 | prop | prop | DD47-A3 |  | soldering iron resting in a coiled stand |
| `dotdashSolderSpool` | text-to-3d | P2 | prop | prop | DD47-A3 |  | spool of silver solder wire |
| `dotdashMug` | text-to-3d | P2 | prop | prop | DD47-A3 |  | ceramic coffee mug with a chipped rim |

## G14 cross-hop (prefix `xhop`)

Style: handmade tabletop toy diorama, chalk mint, butter yellow, terracotta and slate with coin-gold accents, painted wood, felt, clay and glossy lacquer, chunky toy proportions with bevelled edges.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `xhopCoin` | text-to-3d | P1 | prop | prop | CH47-09 |  | thick round toy coin in gold lacquer with a raised star |
| `xhopLogShort` | text-to-3d | P1 | prop | prop | CH47-09 |  | short painted-wood toy log with bark rings |
| `xhopLogLong` | text-to-3d | P1 | prop | prop | CH47-09 |  | long painted-wood toy log with a branch stub |
| `xhopLilyPad` | text-to-3d | P1 | prop | prop | CH47-09 |  | felt toy lily pad with a pink flower |
| `xhopBasaltStone` | text-to-3d | P1 | prop | prop | CH47-09 |  | dark clay basalt stepping stone with a flat top |
| `xhopArchMeadow` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch of painted wood with felt flowers |
| `xhopArchTown` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch of painted bricks with a clock |
| `xhopArchHarvest` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch made of hay bales and pumpkins |
| `xhopArchEmber` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch of basalt with glowing lava cracks |
| `xhopArchNeon` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch of lacquered slate with glowing lamps |
| `xhopArchToybox` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy gate arch made of stacked pastel toy blocks |
| `xhopBushFelt` | text-to-3d | P1 | prop | prop | CH47-10 |  | round felt bush in chalk mint |
| `xhopFlowerPatch` | text-to-3d | P1 | prop | prop | CH47-10 |  | patch of felt wildflowers |
| `xhopFencePost` | text-to-3d | P1 | prop | prop | CH47-10 |  | short painted picket fence segment |
| `xhopMailbox` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy mailbox on a post |
| `xhopStreetTree` | text-to-3d | P1 | prop | prop | CH47-10 |  | lollipop toy street tree on a round base |
| `xhopBusStop` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy bus stop sign with a bench |
| `xhopHayBale` | text-to-3d | P1 | prop | prop | CH47-10 |  | round toy hay bale |
| `xhopPumpkin` | text-to-3d | P1 | prop | prop | CH47-10 |  | clay toy pumpkin |
| `xhopWindmillToy` | text-to-3d | P1 | prop | prop | CH47-10 |  | small toy windmill with turning sails |
| `xhopBasaltSpire` | text-to-3d | P1 | prop | prop | CH47-10 |  | dark basalt spire with lava glow |
| `xhopLavaRock` | text-to-3d | P1 | prop | prop | CH47-10 |  | lava rock with glowing cracks |
| `xhopSteamVent` | text-to-3d | P1 | prop | prop | CH47-10 |  | small clay steam vent cone |
| `xhopNeonLamp` | text-to-3d | P1 | prop | prop | CH47-10, CH47-02 |  | toy street lamp with a glowing bulb |
| `xhopToyBench` | text-to-3d | P1 | prop | prop | CH47-10 |  | lacquered toy park bench |
| `xhopHydrant` | text-to-3d | P1 | prop | prop | CH47-10 |  | toy fire hydrant |
| `xhopToyBlocks` | text-to-3d | P1 | prop | prop | CH47-10 |  | stack of pastel toy alphabet-free blocks |
| `xhopCrayonCup` | text-to-3d | P1 | prop | prop | CH47-10 |  | cup of chunky toy crayons |
| `xhopSpinningTop` | text-to-3d | P1 | prop | prop | CH47-10 |  | wooden spinning top |
| `xhopPaperPlane` | text-to-3d | P1 | prop | prop | CH47-10 |  | folded paper plane |
| `xhopRailCrossing` | text-to-3d | P2 | prop | prop | CH47-16 |  | toy railway crossing with sleepers and a striped crossing arm |
| `xhopTramPole` | text-to-3d | P2 | prop | prop | CH47-16 |  | toy tram catenary pole |
| `xhopTrackSegment` | text-to-3d | P2 | prop | prop | CH47-16 |  | toy railway track segment |
| `xhopReeds` | text-to-3d | P2 | prop | prop | CH47-16 |  | clump of felt reeds |
| `xhopKerb` | text-to-3d | P2 | prop | prop | CH47-16 |  | toy kerb stone segment |
| `xhopTrafficBoxtruck` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficBoxtruck.9c1d690d.glb` | glossy butter yellow lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficHatch` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficHatch.07e1f8e1.glb` | glossy chalk mint lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficPickup` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficPickup.26430aa6.glb` | glossy terracotta lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficSedan` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficSedan.5c9c3aaf.glb` | glossy slate blue lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficSkyCar` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficSkyCar.d56a7d76.glb` | glossy lilac lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficSuv` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficSuv.0013779f.glb` | glossy forest green lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficTaxi` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficTaxi.22c9d43b.glb` | glossy sunflower lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrafficVan` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trafficVan.bfd54772.glb` | glossy cream and coral lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTrainCar` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/trainCar.dfc89f87.glb` | glossy cherry red lacquered toy car paint with soft clearcoat, cream trim and dark window glass |
| `xhopTramCar` | retexture | P2 | vehicle | vehicle | CH47-08 | `apps/showcase-cross-hop/public/aura-assets/tramCar.071322a7.glb` | glossy teal and cream lacquered toy car paint with soft clearcoat, cream trim and dark window glass |

## G15 strange-orbit-port (prefix `crater`)

Style: moon race painted in thick gouache at planet-rise, terracotta, deep teal and chalk with amber and jade accents, visible brush strokes and matte painterly surfaces.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `craterBikeRider` | retexture | P1 | vehicle | vehicle | SO47-M1 | `examples/strange-orbit-port/assets/models/bike_rider.glb` | lunar race bike and rider in chalk white and terracotta with jade accents, thick gouache paint with visible brush strokes, matte impasto |
| `craterSkateRider` | retexture | P1 | humanoid | character | SO47-M1 | `examples/strange-orbit-port/assets/models/skate_rider.glb` | lunar skate rider in deep teal and terracotta, thick gouache paint with visible brush strokes, matte impasto |
| `craterPylon` | retexture | P1 | prop | prop | SO47-M1 | `examples/strange-orbit-port/assets/models/pylon.glb` | course pylon in amber and chalk, thick gouache paint with visible brush strokes, matte impasto |
| `craterBoulderA` | retexture | P1 | prop | prop | SO47-M1 | `examples/strange-orbit-port/assets/models/boulder_a.glb` | terracotta moon boulder, thick gouache paint with visible brush strokes, matte impasto |
| `craterBoulderB` | retexture | P1 | prop | prop | SO47-M1 | `examples/strange-orbit-port/assets/models/boulder_b.glb` | teal-shadowed moon boulder, thick gouache paint with visible brush strokes, matte impasto |
| `craterLander` | retexture | P1 | environment | background | SO47-M1 | `examples/strange-orbit-port/assets/models/lander.glb` | old lunar lander in chalk and amber, thick gouache paint with visible brush strokes, matte impasto |
| `craterObservatory` | retexture | P1 | environment | background | SO47-M1 | `examples/strange-orbit-port/assets/models/observatory.glb` | lunar observatory dome in chalk with a teal slit, thick gouache paint with visible brush strokes, matte impasto |
| `craterRivalSaffron` | retexture | P2 | vehicle | vehicle | SO47-M2 | `examples/strange-orbit-port/assets/models/rival_bike.glb` | rival race bike livery in saffron and black, thick gouache paint with visible brush strokes, matte impasto |
| `craterRivalCobalt` | retexture | P2 | vehicle | vehicle | SO47-M2 | `examples/strange-orbit-port/assets/models/rival_bike.glb` | rival race bike livery in cobalt and white, thick gouache paint with visible brush strokes, matte impasto |
| `craterRivalViolet` | retexture | P2 | vehicle | vehicle | SO47-M2 | `examples/strange-orbit-port/assets/models/rival_bike.glb` | rival race bike livery in violet and silver, thick gouache paint with visible brush strokes, matte impasto |
| `craterRivalMoss` | retexture | P2 | vehicle | vehicle | SO47-M2 | `examples/strange-orbit-port/assets/models/rival_bike.glb` | rival race bike livery in moss green and cream, thick gouache paint with visible brush strokes, matte impasto |
| `craterRivalRust` | retexture | P2 | vehicle | vehicle | SO47-M2 | `examples/strange-orbit-port/assets/models/rival_bike.glb` | rival race bike livery in rust red and charcoal, thick gouache paint with visible brush strokes, matte impasto |
| `craterGateArch` | text-to-3d | P1 | environment | background | SO47-A1 |  | lunar race gate arch of rough terracotta stone with amber beacon lamps |
| `craterCrystalCluster` | text-to-3d | P1 | prop | prop | SO47-A1 |  | cluster of jade moon crystals on a rock base |
| `craterPaddockDome` | text-to-3d | P2 | environment | background | SO47-W2 |  | lit inflatable paddock dome on the moon with ribs and an airlock |
| `craterGrandstand` | text-to-3d | P2 | environment | background | SO47-W2 |  | small lunar grandstand with a canopy and railings |
| `craterCommMast` | text-to-3d | P2 | prop | prop | SO47-W2 |  | lunar comm mast with dishes and a beacon |

## G16 splat-rush-port (prefix `chroma`)

Style: hand-inked cel paint carnival at sunset, ink teal, apricot, rose and lilac, wet glossy paint, enamel, painted wood and paper, whimsical toy shapes.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `chromaPaintPotIsland` | text-to-3d | P1 | environment | background | CR-A1 |  | floating island shaped like a giant tipped paint pot spilling a glossy paint river |
| `chromaPaletteIsland` | text-to-3d | P1 | environment | background | CR-A1 |  | floating island shaped like an artist palette with paint blobs and a tall brush tower |
| `chromaTubeBalloon` | text-to-3d | P1 | environment | background | CR-A1 |  | hot-air balloon shaped like a squeezed paint tube with a basket |
| `chromaCrayonSpire` | text-to-3d | P1 | environment | background | CR-A1 |  | tall spire made of stacked giant crayons on a floating rock |
| `chromaEaselIsland` | text-to-3d | P1 | environment | background | CR-A1 |  | floating island with a tall wooden easel holding a blank canvas |
| `chromaGemDouble` | retexture | P2 | prop | prop | CR-A2 | `examples/splat-rush-port/assets/models/gem-double.glb` | glossy apricot enamel gem with a polished gold rim |
| `chromaGemRainbow` | retexture | P2 | prop | prop | CR-A2 | `examples/splat-rush-port/assets/models/gem-rainbow.glb` | glossy multi-colour enamel gem with a polished gold rim |
| `chromaGemShield` | retexture | P2 | prop | prop | CR-A2 | `examples/splat-rush-port/assets/models/gem-shield.glb` | glossy teal enamel gem with a polished gold rim |
| `chromaGemSwitch` | retexture | P2 | prop | prop | CR-A2 | `examples/splat-rush-port/assets/models/gem-switch.glb` | glossy lilac enamel gem with a polished gold rim |

## G17 serpentine-sky-run-port (prefix `serp`)

Style: mythic dusk pilgrimage above a cloud sea, indigo, coral, cloud gold and pearl jade, red lacquer, gold leaf, mother-of-pearl and carved jade, ornate temple craft.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `serpSerpentHead` | text-to-3d | P1 | environment | background | SSR-10 |  | colossal serpent dragon head with pearl and jade scales, gold whiskers and glowing eyes, emerging from clouds |
| `serpPavilion` | text-to-3d | P1 | environment | background | SSR-10 |  | red-lacquer sky pavilion with gold roof ridges on a floating cloud rock |
| `serpSpireA` | text-to-3d | P1 | environment | background | SSR-10 |  | slender jade spire island with a small pagoda on top |
| `serpSpireB` | text-to-3d | P1 | environment | background | SSR-10 |  | twisted rock spire with hanging lanterns and gold rings |
| `serpSpireC` | text-to-3d | P1 | environment | background | SSR-10 |  | tall pagoda island with five tiers above clouds |
| `serpStageGate` | text-to-3d | P1 | environment | background | SSR-10 |  | ornate stage gate arch with coral silk banners and gold finials |
| `serpFlagLine` | text-to-3d | P1 | prop | prop | SSR-10 |  | line of small coral, gold and jade prayer flags on a rope |
| `serpRunnerTide` | retexture | P1 | humanoid | character | SSR-10 | `examples/saiyan-snake-way-port/assets/runner.glb` | runner outfit in teal suit with cyan glowing trim and pearl accents (skinned source: transplant maps onto the rig) |
| `serpRunnerViolet` | retexture | P1 | humanoid | character | SSR-10 | `examples/saiyan-snake-way-port/assets/runner.glb` | runner outfit in indigo suit with violet glowing trim and gold accents (skinned source: transplant maps onto the rig) |
| `serpRunnerVerdant` | retexture | P1 | humanoid | character | SSR-10 | `examples/saiyan-snake-way-port/assets/runner.glb` | runner outfit in moss tunic with green glowing trim and coral sash (skinned source: transplant maps onto the rig) |
| `serpLanternGlow` | retexture | P1 | prop | prop | SSR-10 | `examples/saiyan-snake-way-port/assets/lantern.glb` | red lacquer lantern with gold ribs and a warm glowing emissive paper panel |

## G18 drift-and-deliver-port (prefix `gridlock`)

Style: pastel hillside harbour town just after summer rain, wet charcoal asphalt, terracotta, mint and cream, painted stucco, wet metal and glass.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `gridlockCourierTeal` | retexture | P1 | vehicle | vehicle | GC-M3 | `examples/drift-and-deliver-port/assets/models/courier.glb` | courier hatchback in courier teal with a cream roof, an orange stripe and a black roof rack, glossy wet paint |
| `gridlockHatchPastel` | retexture | P1 | vehicle | vehicle | GC-M3 | `examples/drift-and-deliver-port/assets/models/hatch.glb` | small hatchback in pastel mint paint with wet clearcoat and chrome trim |
| `gridlockSedanPastel` | retexture | P1 | vehicle | vehicle | GC-M3 | `examples/drift-and-deliver-port/assets/models/sedan.glb` | sedan in terracotta paint with wet clearcoat and chrome trim |
| `gridlockTruckPastel` | retexture | P1 | vehicle | vehicle | GC-M3 | `examples/drift-and-deliver-port/assets/models/truck.glb` | delivery truck in cream paint with wet clearcoat and a blank cargo box |
| `gridlockVanPastel` | retexture | P1 | vehicle | vehicle | GC-M3 | `examples/drift-and-deliver-port/assets/models/van.glb` | van in faded rose paint with wet clearcoat |
| `gridlockBench` | text-to-3d | P1 | prop | prop | GC-A2 |  | harbour town street bench with wrought iron sides and painted slats |
| `gridlockBollard` | text-to-3d | P1 | prop | prop | GC-A2 |  | cast iron harbour bollard painted cream with a teal band |
| `gridlockPlanter` | text-to-3d | P1 | prop | prop | GC-A2 |  | terracotta street planter with geraniums |
| `gridlockCafeTable` | text-to-3d | P1 | prop | prop | GC-A2 |  | small cafe table with two chairs and a striped umbrella |
| `gridlockBikeRack` | text-to-3d | P1 | prop | prop | GC-A2 |  | bike rack with a parked city bicycle |
| `gridlockTrashBin` | text-to-3d | P1 | prop | prop | GC-A2 |  | painted metal street litter bin on a post |
| `gridlockParcel` | text-to-3d | P2 | prop | prop | GC-M4 |  | cardboard parcel box tied with twine and a blank label |
| `gridlockExpressTag` | text-to-3d | P2 | prop | prop | GC-M4 |  | bright express delivery tag token with a lightning shape |
| `gridlockCareBox` | text-to-3d | P2 | prop | prop | GC-M4 |  | padded care box with a carry handle |
| `gridlockHarbourCranes` | text-to-3d | P2 | environment | background | GC-A1 |  | pair of old harbour cranes on rails |
| `gridlockBoats` | text-to-3d | P2 | environment | background | GC-A1 |  | cluster of moored pastel fishing boats |
| `gridlockHotel` | text-to-3d | P2 | environment | background | GC-A1 |  | grand hillside hotel with balconies and awnings |
| `gridlockFunicular` | text-to-3d | P2 | environment | background | GC-A1 |  | hillside funicular car on an inclined track |
| `gridlockMarketHall` | text-to-3d | P2 | environment | background | GC-A1 |  | covered market hall with iron and glass roof |
| `gridlockPedestrian` | text-to-3d | P3 | humanoid | character | GC-AN2 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, townsperson in a cream linen shirt and teal trousers |
| `gridlockPedestrianRig` | rig | P3 | humanoid | character | GC-AN2 | after `gridlockPedestrian` | height 1.74 m |
| `gridlockPedestrianAnim` | animate | P3 | humanoid | character | GC-AN2 | after `gridlockPedestrianRig` | stepBack=543, idle=0 |

## G19 heatsink-port (prefix `ion`)

Style: alien blue-hour canyon, teal haze, aurora violet and magenta-to-amber light with copper and ion-cyan accents, obsidian glass, anodised copper and bioluminescent crystal.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `ionSentryDrone` | text-to-3d | P1 | vehicle | vehicle | IC-13 |  | alien sentry drone with an anodised copper shell, glowing cyan lens and vents |
| `ionHeavyDrone` | text-to-3d | P1 | vehicle | vehicle | IC-13 |  | heavy armoured alien drone with copper plates and violet glow |
| `ionCrystalA` | text-to-3d | P2 | prop | prop | IC-14 |  | cluster of tall bioluminescent cyan crystals on obsidian |
| `ionCrystalB` | text-to-3d | P2 | prop | prop | IC-14 |  | wide fan of violet glowing crystals |
| `ionCrystalC` | text-to-3d | P2 | prop | prop | IC-14 |  | low crystal crust with magenta glow |
| `ionRibcageArch` | text-to-3d | P2 | environment | background | IC-15 |  | fossil ribcage arch of a giant creature spanning a road |
| `ionCliffDwelling` | text-to-3d | P2 | environment | background | IC-17 |  | alien cliff dwelling carved into rock with lit windows |
| `ionNeedleSpire` | text-to-3d | P2 | environment | background | IC-17 |  | thin needle rock spire with glowing veins |
| `ionDrone2Copper` | retexture | P3 | vehicle | vehicle | IC-16 | `examples/heatsink-port/assets/models/drone2.glb` | anodised copper drone shell with cyan glowing seams |

## G20 ninja-runner-port (prefix `ninja`)

Style: woodblock-print evening village, indigo, persimmon and mist-paper cream with lantern amber, aged wood, washi paper, lacquer and clay roof tiles, ink-outlined print style.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `ninjaHouseADusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/houseA.glb` | village house with indigo tile roof and persimmon timber, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaHouseBDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/houseB.glb` | village house with mist paper walls and dark wood, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaHouseCDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/houseC.glb` | two-storey village house with lantern-lit windows, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaHouseDDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/houseD.glb` | merchant house with a cloth awning, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaTeahouseDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/teahouse.glb` | teahouse with red lacquer posts and paper lanterns, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaTowerDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/tower.glb` | watch tower with indigo roofs, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaGateDusk` | retexture | P1 | environment | background | NR-12 | `examples/ninja-runner-port/assets/meshy/gate.glb` | village gate with weathered wood, woodblock print colours at dusk, ink-outlined, no dark faceting |
| `ninjaPineDusk` | retexture | P1 | prop | prop | NR-12 | `examples/ninja-runner-port/assets/meshy/pine.glb` | pine tree with smooth ink-outlined needle clumps, woodblock print colours |
| `ninjaOakDusk` | retexture | P1 | prop | prop | NR-12 | `examples/ninja-runner-port/assets/meshy/oak.glb` | oak tree with smooth rounded leaf masses, woodblock print colours |
| `ninjaHeroDusk` | retexture | P1 | humanoid | character | NR-12 | `examples/ninja-runner-port/assets/meshy/hero.glb` | runner hero outfit in indigo with a vermilion scarf, woodblock print colours (skinned source: transplant maps onto the rig) |
| `ninjaLanternGarland` | text-to-3d | P1 | prop | prop | NR-12 |  | garland of paper lanterns on a rope |
| `ninjaStoneLantern` | text-to-3d | P1 | prop | prop | NR-12 |  | carved stone garden lantern |
| `ninjaNoren` | text-to-3d | P1 | prop | prop | NR-12 |  | split cloth door curtain on a rod, plain indigo |
| `ninjaBamboo` | text-to-3d | P1 | prop | prop | NR-12 |  | cluster of bamboo stalks |
| `ninjaBlossomTree` | text-to-3d | P1 | prop | prop | NR-12 |  | blossom tree with pale pink flowers |
| `ninjaWaterWheel` | text-to-3d | P1 | environment | background | NR-12 |  | wooden water wheel on a mill |
| `ninjaShrineGate` | text-to-3d | P1 | environment | background | NR-12 |  | persimmon red shrine gate |
| `ninjaPagodaSilhouette` | text-to-3d | P1 | environment | background | NR-12 |  | distant pagoda silhouette |
| `ninjaReeds` | text-to-3d | P1 | prop | prop | NR-12 |  | clump of river reeds |
| `ninjaLaundryLine` | text-to-3d | P1 | prop | prop | NR-12 |  | laundry line with cloths between poles |
| `ninjaCaster` | text-to-3d | P1 | humanoid | character | NR-12 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, robed spell caster in indigo robes with a straw hat, woodblock print colours |
| `ninjaScout` | text-to-3d | P1 | humanoid | character | NR-12 |  | full body, standing in an A-pose with arms slightly away from the body and feet apart, generic person, light scout in dark wrapped clothing and a mask, woodblock print colours |
| `ninjaCasterRig` | rig | P1 | humanoid | character | NR-12 | after `ninjaCaster` | height 1.75 m |
| `ninjaScoutRig` | rig | P1 | humanoid | character | NR-12 | after `ninjaScout` | height 1.7 m |
| `ninjaCasterAnim` | animate | P1 | humanoid | character | NR-12 | after `ninjaCasterRig` | idle=0, cast=125, hit=178, death=189 |
| `ninjaScoutAnim` | animate | P1 | humanoid | character | NR-12 | after `ninjaScoutRig` | idle=0, throw=239, hit=178, death=189 |

## G21 last-train-port (prefix `lamplight`)

Style: warm tilt-shift miniature of pastel hill towns floating on a sunlit cloud sea, apricot, rose, cream stucco, terracotta and lilac with lamplight amber, painted plaster, glazed tile, brass and teak.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `lamplightTramEnamel` | retexture | P1 | vehicle | vehicle | LT-11, LT-08 | `examples/last-train-port/assets/meshy/tram.glb` | tram in cherry red enamel with a cream band, brass fittings, teak panels and glowing warm headlamps and bulbs |
| `lamplightTreeMangoA` | text-to-3d | P1 | prop | prop | LT-10 |  | mango tree with a round canopy |
| `lamplightTreeMangoB` | text-to-3d | P1 | prop | prop | LT-10 |  | tall mango tree with fruit |
| `lamplightTreeLemonA` | text-to-3d | P1 | prop | prop | LT-10 |  | lemon tree in a pot |
| `lamplightTreeLemonB` | text-to-3d | P1 | prop | prop | LT-10 |  | lemon tree with a twisted trunk |
| `lamplightTreeCypressA` | text-to-3d | P1 | prop | prop | LT-10 |  | slim cypress tree |
| `lamplightTreeCypressB` | text-to-3d | P1 | prop | prop | LT-10 |  | pair of cypress trees |
| `lamplightTreeOliveA` | text-to-3d | P1 | prop | prop | LT-10 |  | silver olive tree |
| `lamplightTreeOliveB` | text-to-3d | P1 | prop | prop | LT-10 |  | old gnarled olive tree |
| `lamplightTreePalmA` | text-to-3d | P1 | prop | prop | LT-10 |  | small fan palm |
| `lamplightTreePalmB` | text-to-3d | P1 | prop | prop | LT-10 |  | tall date palm |
| `lamplightTreeAlmondA` | text-to-3d | P1 | prop | prop | LT-10 |  | almond tree with pale blossom |
| `lamplightTreeAlmondB` | text-to-3d | P1 | prop | prop | LT-10 |  | young almond tree |
| `lamplightUndersideA` | text-to-3d | P1 | environment | background | LT-10 |  | rocky underside of a floating island with hanging roots |
| `lamplightUndersideB` | text-to-3d | P1 | environment | background | LT-10 |  | cone-shaped floating island underside with waterfalls |
| `lamplightUndersideC` | text-to-3d | P1 | environment | background | LT-10 |  | layered stone floating island underside |
| `lamplightRockA` | text-to-3d | P1 | prop | prop | LT-10 |  | pale limestone rock |
| `lamplightRockB` | text-to-3d | P1 | prop | prop | LT-10 |  | terracotta boulder |
| `lamplightRockC` | text-to-3d | P1 | prop | prop | LT-10 |  | mossy rock |
| `lamplightRockD` | text-to-3d | P1 | prop | prop | LT-10 |  | cluster of small stones |
| `lamplightCloudPuffA` | text-to-3d | P1 | prop | prop | LT-10 |  | soft round cloud puff |
| `lamplightCloudPuffB` | text-to-3d | P1 | prop | prop | LT-10 |  | long flat cloud puff |
| `lamplightRiderARig` | rig | P1 | humanoid | character | LT-11 | `examples/last-train-port/assets/meshy/pax-easy.glb` | height 1.7 m |
| `lamplightRiderAAnim` | animate | P1 | humanoid | character | LT-11 | after `lamplightRiderARig` | idle=11, sway=415 |
| `lamplightRiderBRig` | rig | P1 | humanoid | character | LT-11 | `examples/last-train-port/assets/meshy/pax-rushed.glb` | height 1.75 m |
| `lamplightRiderBAnim` | animate | P1 | humanoid | character | LT-11 | after `lamplightRiderBRig` | idle=12, sway=56 |
| `lamplightRiderCRig` | rig | P1 | humanoid | character | LT-11 | `examples/last-train-port/assets/meshy/pax-sightseer.glb` | height 1.68 m |
| `lamplightRiderCAnim` | animate | P1 | humanoid | character | LT-11 | after `lamplightRiderCRig` | idle=0, sway=48 |
| `lamplightRiderDRig` | rig | P1 | humanoid | character | LT-11 | `examples/last-train-port/assets/meshy/pax-sleeper2.glb` | height 1.72 m |
| `lamplightRiderDAnim` | animate | P1 | humanoid | character | LT-11 | after `lamplightRiderDRig` | idle=38, sway=268 |
| `lamplightSignalPost` | text-to-3d | P1 | prop | prop | LT-12 |  | railway signal post with red and green lamps |
| `lamplightBunting` | text-to-3d | P1 | prop | prop | LT-12 |  | string of pastel bunting flags |
| `lamplightHorizonIslandA` | text-to-3d | P1 | environment | background | LT-12 |  | distant floating island with a hill town silhouette |
| `lamplightHorizonIslandB` | text-to-3d | P1 | environment | background | LT-12 |  | distant floating island with a lighthouse |
| `lamplightGull` | text-to-3d | P1 | prop | prop | LT-12 |  | white seagull gliding with spread wings |
| `lamplightSkyLantern` | text-to-3d | P1 | prop | prop | LT-13 |  | paper sky lantern with a warm glowing flame |

## G22 roadster-hours-port (prefix `saltwind`)

Style: wind-scoured maritime road trip in 4 pm salt haze, salt white, sea teal and ochre with signal red accents, sun-bleached limestone, salt-faded paint and galvanised steel.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `saltwindBusSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-bus-r/model.glb` | coach bus in salt white and sea teal, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindSedanSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-sedan-r/model.glb` | sedan in faded ochre, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindHatchSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-hatch-r/model.glb` | hatchback in sea teal, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindSuvSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-suv-r/model.glb` | SUV in sand beige, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindPickupSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-pickup-r/model.glb` | pickup in faded red, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindBoxtruckSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-boxtruck-r/model.glb` | box truck in salt white, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindSemiSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-semi-r/model.glb` | semi truck in ochre, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindTankerSalt` | retexture | P1 | vehicle | vehicle | RH47-09 | `main:artifacts/meshy/rr-tanker-r/model.glb` | tanker truck in pale grey, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindLighthouseSalt` | retexture | P1 | environment | background | RH47-09 | `main:artifacts/meshy/rr-lighthouse-r/model.glb` | red and white lighthouse, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindPalmSalt` | retexture | P1 | prop | prop | RH47-09 | `main:artifacts/meshy/rr-palm-r/model.glb` | coastal palm, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindPineSalt` | retexture | P1 | prop | prop | RH47-09 | `main:artifacts/meshy/rr-pine-r/model.glb` | windswept pine, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindTownhouseSalt` | retexture | P1 | environment | background | RH47-09 | `main:artifacts/meshy/rr-townhouse-r/model.glb` | limestone townhouse, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindVillaSalt` | retexture | P1 | environment | background | RH47-09 | `main:artifacts/meshy/rr-villa-r/model.glb` | white villa, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindVilla2Salt` | retexture | P1 | environment | background | RH47-09 | `main:artifacts/meshy/rr-villa2-r/model.glb` | ochre villa, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindBouldersSalt` | retexture | P1 | prop | prop | RH47-09 | `main:artifacts/meshy/rr-boulders-r/model.glb` | limestone boulders, full PBR with normal and roughness, salt-faded coastal palette |
| `saltwindRoadster` | text-to-3d | P1 | vehicle | vehicle | RH47-09 |  | open-top two-seat roadster with separate body, glass windscreen, chrome trim and lamp parts, salt white paint with a signal red stripe |
| `saltwindTurbineTower` | text-to-3d | P1 | environment | background | RH47-11 |  | tall white wind turbine tower and nacelle without blades |
| `saltwindTurbineRotor` | text-to-3d | P1 | prop | prop | RH47-11 |  | three-blade wind turbine rotor hub |
| `saltwindSeaStack` | text-to-3d | P1 | environment | background | RH47-11 |  | limestone sea stack rising from surf |
| `saltwindBoat` | text-to-3d | P1 | prop | prop | RH47-11 |  | small fishing boat with an outboard |
| `saltwindCrane` | text-to-3d | P1 | environment | background | RH47-11 |  | harbour crane |
| `saltwindCypress` | text-to-3d | P1 | prop | prop | RH47-11 |  | tall windswept cypress |
| `saltwindSaltPan` | text-to-3d | P1 | environment | background | RH47-11 |  | salt pan with white heaps and wooden walkways |
| `saltwindMesa` | text-to-3d | P1 | environment | background | RH47-11 |  | red sandstone mesa |
| `saltwindArch` | text-to-3d | P1 | environment | background | RH47-11 |  | natural rock arch |
| `saltwindScrub` | text-to-3d | P1 | prop | prop | RH47-11 |  | dry desert scrub bush |
| `saltwindUplinkMast` | text-to-3d | P1 | prop | prop | RH47-11 |  | uplink mast with dishes |
| `saltwindHoodoo` | text-to-3d | P1 | environment | background | RH47-11 |  | eroded hoodoo rock |
| `saltwindArcology` | text-to-3d | P1 | environment | background | RH47-11 |  | white terraced arcology tower with sea-glass windows |
| `saltwindMaglevTube` | text-to-3d | P1 | environment | background | RH47-11 |  | elevated maglev tube segment |
| `saltwindGantrySign` | text-to-3d | P1 | environment | background | RH47-11 |  | highway gantry sign frame with a blank panel |
| `saltwindAntenna` | text-to-3d | P1 | prop | prop | RH47-11 |  | tall antenna with red beacons |
| `saltwindRelayGantry` | text-to-3d | P1 | environment | background | RH47-11 |  | road relay gantry arch with slim lamps |

## G23 where-the-wind-wanders-port (prefix `bell`)

Style: storybook gouache valley in late afternoon, sage, slate-teal and apricot light with brass and wax-red accents, matte gouache paint with soft brush texture, simple rounded shapes.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `bellKite` | text-to-3d | P1 | prop | prop | WW47-A1 |  | paper kite with a diamond frame and a ribbon tail |
| `bellPineGouache` | retexture | P1 | prop | prop | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/pine.glb` | pine tree in sage greens, matte gouache paint with soft brush texture |
| `bellOakGouache` | retexture | P1 | prop | prop | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/oak.glb` | oak tree in sage and apricot light, matte gouache paint with soft brush texture |
| `bellShrubGouache` | retexture | P1 | prop | prop | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/shrub.glb` | round shrub in sage, matte gouache paint with soft brush texture |
| `bellCottageGouache` | retexture | P1 | environment | background | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/cottage.glb` | stone cottage with a wax red door, matte gouache paint with soft brush texture |
| `bellStoneWall` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | dry-stone wall segment |
| `bellSignpost` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | wooden signpost with blank arms |
| `bellFootbridge` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | small stone footbridge |
| `bellWashingLine` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | washing line with cloths between two posts |
| `bellHaystack` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | round haystack |
| `bellSheep` | text-to-3d | P1 | prop | prop | WW47-A3, WW47-W1 |  | woolly sheep standing |
| `bellPennants` | text-to-3d | P1 | prop | prop | WW47-W1 |  | string of small triangular pennants |
| `bellBelltowerGouache` | retexture | P3 | environment | background | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/belltower.glb` | stone belltower, matte gouache paint with soft brush texture |
| `bellBellGouache` | retexture | P3 | prop | prop | WW47-A2 | `examples/where-the-wind-wanders-port/assets/models/belltower-bell.glb` | brass bell, matte gouache paint with soft brush texture |
| `bellHeroGouache` | retexture | P3 | humanoid | character | WW47-A4 | `examples/where-the-wind-wanders-port/assets/models/hero.glb` | traveller with a wax red scarf and rust cloak, matte gouache paint with soft brush texture (skinned source: transplant maps onto the rig) |

## G24 silt-and-signal-port (prefix `dune`)

Style: hand-inked gouache desert travel poster, sun-bleached sandstone, terracotta and bone white over indigo shadows with jade accents, hand-painted plaster, worn bronze and woven cloth.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `duneCourierOchre` | retexture | P1 | humanoid | character | DG-A3 | `examples/silt-and-signal-port/assets/models/courier.glb` | courier in an ochre flight suit with a long jade scarf and bronze goggles (skinned source: transplant maps onto the rig) |
| `duneHoverboardJade` | retexture | P1 | vehicle | vehicle | DG-A3 | `examples/silt-and-signal-port/assets/models/hoverboard.glb` | hoverboard in sandstone and bronze with glowing jade thruster strips |
| `duneCourierRig` | rig | P1 | humanoid | character | DG-A3 | `examples/silt-and-signal-port/assets/models/courier.glb` | height 1.75 m |
| `duneCourierAnim` | animate | P1 | humanoid | character | DG-A3 | after `duneCourierRig` | boost=54, lean=390, celebrate=59, idle=0 |
| `duneDatePalmA` | text-to-3d | P1 | prop | prop | DG-A1 |  | date palm with heavy fruit |
| `duneDatePalmB` | text-to-3d | P1 | prop | prop | DG-A1 |  | leaning date palm |
| `duneTamarisk` | text-to-3d | P1 | prop | prop | DG-A1 |  | feathery tamarisk tree |
| `duneGrassTuft` | text-to-3d | P1 | prop | prop | DG-A1 |  | desert grass tuft |
| `duneAdobeA` | text-to-3d | P1 | environment | background | DG-A2 |  | small adobe dwelling with a flat roof |
| `duneAdobeB` | text-to-3d | P1 | environment | background | DG-A2 |  | adobe dwelling with a dome and courtyard |
| `duneAdobeC` | text-to-3d | P1 | environment | background | DG-A2 |  | two-storey adobe dwelling with wooden beams |
| `duneReeds` | text-to-3d | P1 | prop | prop | DG-W1 |  | clump of canal reeds |
| `duneClayPots` | text-to-3d | P1 | prop | prop | DG-W1 |  | group of clay pots |
| `duneClothLine` | text-to-3d | P1 | prop | prop | DG-W1 |  | cloth line with dyed fabrics |
| `duneColumnDrum` | text-to-3d | P1 | prop | prop | DG-W1 |  | broken sandstone column drum |
| `duneBones` | text-to-3d | P1 | prop | prop | DG-W1 |  | bleached animal bones in sand |
| `duneSignalMast` | text-to-3d | P2 | prop | prop | DG-A4 |  | bronze signal mast with a jade lens and pennants |
| `duneSilhouetteMesa` | text-to-3d | P2 | environment | background | DG-S2 |  | distant flat mesa silhouette |
| `duneSilhouetteArch` | text-to-3d | P2 | environment | background | DG-S2 |  | distant rock arch silhouette |
| `duneSluiceGate` | text-to-3d | P2 | environment | background | DG-A5 |  | canal sluice gate with wooden paddles |
| `duneSearchlightTower` | text-to-3d | P2 | environment | background | DG-A5 |  | searchlight tower of bronze and stone |
| `duneRootArch` | text-to-3d | P2 | environment | background | DG-A5 |  | arch of giant tree roots |
| `duneCoralSpires` | text-to-3d | P2 | environment | background | DG-A5 |  | dry coral spires |
| `duneOrchardTree` | text-to-3d | P2 | prop | prop | DG-A5 |  | orchard tree with lanterns |
| `dunePollenSail` | text-to-3d | P2 | environment | background | DG-A5 |  | tall pollen-catching sail mast |
| `duneCrownArch` | text-to-3d | P2 | environment | background | DG-A5 |  | crown-shaped stone arch |
| `duneHarbourBridge` | text-to-3d | P2 | environment | background | DG-A5 |  | arched harbour bridge |
| `duneWellHouse` | text-to-3d | P2 | environment | background | DG-A5 |  | domed well house |
| `duneRingJade` | retexture | P3 | prop | prop | DG-A3 | `examples/silt-and-signal-port/assets/models/ringgate.glb` | signal ring gate in sandstone with jade inlay |
| `duneLanternBronze` | retexture | P3 | prop | prop | DG-W1 | `examples/silt-and-signal-port/assets/models/lantern.glb` | worn bronze lantern with warm glass |

## G25 cloud-runner-port (prefix `cumulus`)

Style: storm-washed sky plateau mid-morning after rain, cobalt, wet terracotta sandstone and sage moss with amber accents, wet sandstone, weathered timber, moss and soft cloud.

| Key | Op | Pri | Profile | Role | Used by | Source / depends on | Prompt subject or clips |
|---|---|---|---|---|---|---|---|
| `cumulusHeroTeal` | retexture | P1 | humanoid | character | CD-13 | `examples/kid-goku-beyond-the-clouds-port/assets/meshy/hero.glb` | young traveller in a teal tunic with an amber sash and sandstone boots (skinned source: transplant maps onto the rig) |
| `cumulusTowerA` | text-to-3d | P1 | environment | background | CD-06 |  | towering cumulus storm cloud with silver-lit edges |
| `cumulusTowerB` | text-to-3d | P1 | environment | background | CD-06 |  | tall anvil storm cloud with rain curtain |
| `cumulusTowerC` | text-to-3d | P1 | environment | background | CD-06 |  | billowing cumulus cloud tower |
| `cumulusDeckA` | text-to-3d | P1 | environment | background | CD-06 |  | flat cloud-sea deck tile |
| `cumulusDeckB` | text-to-3d | P1 | environment | background | CD-06 |  | rolling cloud-sea deck tile |
| `cumulusStaff` | text-to-3d | P1 | prop | prop | CD-13 |  | wooden travelling staff with an amber pearl |
| `cumulusJuniperA` | text-to-3d | P1 | prop | prop | CD-13 |  | windswept juniper tree |
| `cumulusJuniperB` | text-to-3d | P1 | prop | prop | CD-13 |  | small twisted juniper |
| `cumulusWaystone` | text-to-3d | P1 | prop | prop | CD-13 |  | carved sandstone waystone |
| `cumulusBridge` | text-to-3d | P1 | environment | background | CD-13 |  | wooden rope bridge segment |
| `cumulusHut` | text-to-3d | P1 | environment | background | CD-13 |  | small stone hut with a timber roof |
| `cumulusBird` | text-to-3d | P1 | prop | prop | CD-13, CD-17 |  | soaring bird with spread wings |
| `cumulusArch` | text-to-3d | P2 | environment | background | CD-20 |  | wind-carved sandstone arch |
| `cumulusCordPole` | text-to-3d | P2 | prop | prop | CD-20 |  | pole with cloth prayer strips |
