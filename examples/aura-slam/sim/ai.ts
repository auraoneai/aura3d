/* AI module: CPU opponent decisions, transcribed from public/toptennis/match-engine.js (the closure functions listed in AI_OWNED_NAMES).
 * Every function keeps its source name, body and constants; the only mechanical change is that free closure variables of the
 * original factory are read from `env` (AiEnv), which the match engine builds from its own closure. */
import { CPU_STYLES, PRO_POSITION, SERVE_CPU, SERVE_RETURN } from "./aiTables";

export const AI_OWNED_NAMES: readonly string[] = ["netPreference","cpuStyle","personalityWeight","makeAITactics","serveAnticipation","serveReceiverDepth","planCPUServe","overheadTarget","advanceReturnPrediction","canPrepareAceReturn","moveServeReceiver","moveAI","copyAIRunner","proBalanceLoad","proContactPressure","recordProContact","readProPattern","readLegendPattern","canReachAITarget","aceSwingContact","proBalancedContactAhead","proCanWaitForBalancedReturn","netVolleyTarget","contactTarget","scheduleAIRead","aiRecoveryTarget","updateAI","predictObservedServe","observeServe","updateServeReceiver","observedServeIntercept","chooseAIShot","canContinueNet","basicNetPlan","netReplyPlan","legendShotPlan","proShotPlan","aiServeReturnPlan","aiShotPlan","aiRallyShotPlan","basicPersonalityPlan","serveBalancedContactAhead"];
export const AI_ENGINE_EXPORTS: readonly string[] = ["makeAITactics","serveAnticipation","serveReceiverDepth","planCPUServe","advanceReturnPrediction","proContactPressure","recordProContact","readProPattern","proBalancedContactAhead","scheduleAIRead","updateAI","aiShotPlan","serveBalancedContactAhead"];
export const AI_ENV_NAMES: readonly string[] = ["state","seeded","clamp","getServeGeometry","playerProfile","lerp","SERVE","TAU","level","preparedCPU","SHOT","GRAVITY","strokes","physics","SINGLES_X","isPro","playerModifier","isServeLandingValid","racketDistance","steerMovement","isLegend","usesNetTactics","updateLocomotion","prepareStroke","shotTrajectory","dropShotSuccess"];

/** Free variables of the original `create()` closure that the AI reads. Live bindings: always read through `env.x`. */
export interface AiEnv {
  readonly state: any;
  readonly seeded: any;
  readonly clamp: any;
  readonly getServeGeometry: any;
  readonly playerProfile: any;
  readonly lerp: any;
  readonly SERVE: any;
  readonly TAU: any;
  readonly level: any;
  readonly preparedCPU: any;
  readonly SHOT: any;
  readonly GRAVITY: any;
  readonly strokes: any;
  readonly physics: any;
  readonly SINGLES_X: any;
  readonly isPro: any;
  readonly playerModifier: any;
  readonly isServeLandingValid: any;
  readonly racketDistance: any;
  readonly steerMovement: any;
  readonly isLegend: any;
  readonly usesNetTactics: any;
  readonly updateLocomotion: any;
  readonly prepareStroke: any;
  readonly shotTrajectory: any;
  readonly dropShotSuccess: any;
}

export function createAiModule(env: AiEnv) {
  // match-engine.js l.98
  const netPreference = () => env.playerProfile(env.state.ai)?.netPreference || 1;

  // match-engine.js l.99
  const cpuStyle = () => env.usesNetTactics() && env.state.ai.controller==='computer'
      ? CPU_STYLES[env.playerProfile(env.state.ai)?.cpuStyle] : undefined;

  // match-engine.js l.102
  function personalityWeight(name: any) {
      const style=cpuStyle();
      if(!style || name==='approach')return 1;
      let weight=style[name]||1;
      const t=env.state.ai.tactics,p=env.state.player;
      const exposed=Math.abs(p.x+p.vx*.16)>.40;
      // Patient construction gives way to a visible opening. Completed shots
      // supply continuity; no timer, pending human input or unsaved memory is used.
      if(style===CPU_STYLES.counterpuncher&&exposed&&['open-court','wrong-foot'].includes(name))
        weight=1.15;
      if(t?.last==='crosscourt'&&exposed&&name==='open-court')weight*=1.12;
      if(t?.last==='open-court'&&p.y>.90&&name==='drop')weight*=1.10;
      return weight;
    }

  // match-engine.js l.117
  function makeAITactics() {
      const point = env.state.stats.pointsWon + env.state.stats.pointsLost;
      const draw = env.seeded(point * 193 + Math.floor(env.state.time * 101) + 83);
      const style=cpuStyle();
      const index=style?(draw<style.patterns[0]?0:draw<style.patterns[1]?1:2):Math.floor(draw*3);
      return {pattern: ['pressure', 'all-court', 'change-up'][index],
        net: false, shots: 0, last: null, repeats: 0};
    }

  // match-engine.js l.515
  function serveAnticipation(geometry: any){
      const cfg=SERVE_CPU[env.state.difficulty];
      if(!cfg||!cfg.bias)return 0;
      const recent=env.state.serveHistory.filter((h: any)=>h.server==='player'&&h.court===env.state.serveCourt&&h.legal).slice(-cfg.history);
      if(cfg.history&&recent.length>=2){
        const wide=recent.filter((h: any)=>Math.abs(h.actual.x)>.55).length/recent.length;
        const tee=recent.filter((h: any)=>Math.abs(h.actual.x)<.25).length/recent.length;
        return geometry.targetSign*(wide>=.6?1:tee>=.6?-1:0)*cfg.bias/5.018;
      }
      // The visible server stance is the only pre-contact evidence at Club.
      return env.clamp((env.state.player.x-geometry.serverX)*.25,-cfg.bias/5.018,cfg.bias/5.018);
    }

  // match-engine.js l.527
  function serveReceiverDepth(){return .86;}

  // match-engine.js l.528
  function planCPUServe(){
      const a=env.state.serveAttempt,cfg=SERVE_CPU[env.state.difficulty],geometry=env.getServeGeometry('ai');
      const draw=(k: any)=>env.seeded(a.errorSeed+k),second=a.number===2;
      const rating=env.playerProfile(env.state.ai)?.ratings.serve||6;
      a.power=!second&&draw(13)<cfg.power*(.8+.05*(rating-6));
      const margin=second?cfg.secondMargin:env.lerp(cfg.margin[0],cfg.margin[1],draw(23));
      const receiver=env.state.player.x,center=geometry.targetSign*.41;
      const choice=draw(31),open=receiver>=center?-1:1;
      let x=choice<.28?env.clamp(receiver,geometry.minX+.12,geometry.maxX-.12)
        :choice<.82?(open<0?geometry.minX+margin/5.018:geometry.maxX-margin/5.018)
        :(open<0?geometry.maxX-margin/5.018:geometry.minX+margin/5.018);
      const expectedDepth=.52-margin/11.885;
      a.aim={x:env.clamp(x,geometry.minX,geometry.maxX),y:Math.max(0,expectedDepth-(a.power?env.SERVE.powerDepthMetres/11.885:0))};
      const gaussian=Math.sqrt(-2*Math.log(Math.max(.000001,draw(47))))*Math.cos(env.TAU*draw(59));
      const sd=(second?cfg.secondSD:cfg.firstSD*1.18)*(1+.06*(10-rating));
      a.cpuTimingOffset=env.clamp(gaussian*sd,-env.SERVE.timingWindow,env.SERVE.timingWindow);
      a.cpuPace=cfg.pace*(second?.95:1);
    }

  // match-engine.js l.1189
  function overheadTarget(ball: any) {
      if (ball.highDeepLob || !ball.active || ball.vy >= 0 || ball.lastHit === 'ai' || ball.bounceCount !== 0 || ball.isServe) return null;
      const ai = env.state.ai, cfg = env.level();
      const windup = env.preparedCPU() ? env.SHOT.contactOpens : .075;
      const descendingTime = (height: any) => {
        const discriminant = ball.vz * ball.vz + 2 * env.GRAVITY * (ball.z - height);
        return discriminant < 0 ? Infinity : (ball.vz + Math.sqrt(discriminant)) / env.GRAVITY;
      };
      const lowest = descendingTime(env.strokes.SMASH_MIN + .04);
      if (!Number.isFinite(lowest)) return null;
      const highest = descendingTime(env.strokes.SMASH_MAX - .04);
      const end = Math.min(2.5, lowest);
      const start = Math.max(windup, Number.isFinite(highest) ? highest : Math.max(0, ball.vz / env.GRAVITY));
      if (start > end) return null;
      for (let time = start; time <= end + 1e-9; time += .02) {
        const intercept = env.physics.sample(ball, time);
        if (Math.abs(intercept.x) > env.SINGLES_X || intercept.y > -.12 || intercept.y < -1) continue;
        // Stand a little deeper than the ball so contact stays in front of
        // the shoulder. Reserve time for acceleration and swing preparation.
        const target = { x: intercept.x, y: Math.max(-1.18, intercept.y - .055) };
        const travel = Math.hypot(target.x - ai.x, target.y - ai.y);
        const movementTime = Math.max(0, time - windup - ai.reactionTimer - .12);
        if (env.isPro()||env.playerProfile(ai)?.movement ? canReachAITarget(target,time,windup,.045)
          : travel <= cfg.speed * env.playerModifier(ai,'footwork') * movementTime + .045) return target;
      }
      return null;
    }

  // match-engine.js l.1217
  function advanceReturnPrediction(ball: any, dt: any) {
      env.physics.advance(ball, dt, env.state.venue, (event: any, predicted: any) => {
        if (event === 'net' || event === 'board' || event === 'bounce' &&
          (predicted.bounceCount >= 2 || !(predicted.isServe ? env.isServeLandingValid(predicted) : env.physics.inSingles(predicted, predicted.lastHit)))) {
          predicted.active = false;
        } else if (event === 'bounce') {
          // A legal serve may only be returned after its first bounce.
          if (predicted.isServe && predicted.netTouched) predicted.active = false;
          predicted.isServe = false;
        }
      });
      if (Math.abs(ball.x) > 1.5 || Math.abs(ball.y) > 1.65) ball.active = false;
    }

  // match-engine.js l.1231
  function canPrepareAceReturn(actor: any, ball: any, defensive = false) {
      if (!ball.active || ball.lastHit === 'ai' || ball.vy >= 0 || ball.y >= -.015 || ball.isServe && ball.bounceCount === 0) return false;
      const stroke = env.strokes.select(actor, ball);
      if(env.isPro()&&stroke.kind==='smash'&&actor.pro?.lobRetreat&&
        (actor.vy<-.15||Math.hypot(actor.vx,actor.vy)>.42))return false;
      if (defensive && (stroke.kind === 'smash' || stroke.kind.endsWith('-volley'))) return false;
      const reach = env.level().reach * stroke.reachScale;
      const distance = env.racketDistance(actor,ball);
      // Keep a small placement margin. Preparation must never depend on
      // the extra reach used by the easier levels while they keep running.
      const balanced = env.isPro() && !defensive;
      if (!stroke.reachable || distance > (balanced ? reach * .82 : reach - .004)) return false;
      return stroke.kind === 'smash'
        ? ball.vz <= 0 && ball.y >= -1 && Math.abs(ball.x) <= env.SINGLES_X
        : ball.z > (balanced ? .16 : .04) && ball.z < env.level().maxHitZ;
    }

  // match-engine.js l.1248
  function moveServeReceiver(actor: any,target: any,dt: any,planted: any){
      // A serve read and its speculative runners share one physical mover. The
      // court's depth unit is longer than its width unit; using those raw axes
      // gave forward chases more than twice the lateral running speed.
      const dx=(target.x-actor.x)*5.018,dy=(target.y-actor.y)*11.885,distance=Math.hypot(dx,dy);
      const runner={rosterId:actor.rosterId,customRatings:actor.customRatings,vx:actor.vx*5.018,vy:actor.vy*11.885};
      const maximum=SERVE_CPU[env.state.difficulty].runSpeedMetres*env.playerModifier(actor,'footwork');
      if(planted){runner.vx=0;runner.vy=0;}
      else if(distance>.06){
        const speed=Math.min(maximum,distance*7);
        env.steerMovement(runner,dx/distance*speed,dy/distance*speed,maximum,env.isLegend()?10.5:9,dt);
      }else{
        const braking=env.playerProfile(actor)?.movement?.braking??1;
        runner.vx*=Math.max(0,1-dt*10*braking);runner.vy*=Math.max(0,1-dt*10*braking);
      }
      actor.vx=runner.vx/5.018;actor.vy=runner.vy/11.885;
      actor.x=env.clamp(actor.x+actor.vx*dt,-1.06,1.06);
      actor.y=env.clamp(actor.y+actor.vy*dt,-1.22,-.14);
    }

  // match-engine.js l.1268
  function moveAI(actor: any, target: any, dt: any, planted = false, serving = false) {
      if(actor.controller==='computer'&&env.state.phase==='rally'&&env.state.ball.shotType==='serve'&&env.state.ball.lastHit==='player'){
        moveServeReceiver(actor,target,dt,planted);return;
      }
      const strategy=env.isPro()?actor.pro:null;
      if(strategy){
        strategy.recoveryLeft=Math.max(0,strategy.recoveryLeft-dt);
        strategy.depthHold=Math.max(0,strategy.depthHold-dt);
        strategy.turnLeft=Math.max(0,(strategy.turnLeft||0)-dt);
        strategy.balanceLeft=Math.max(0,(strategy.balanceLeft||0)-dt);
        strategy.responseLeft=Math.max(0,(strategy.responseLeft||0)-dt);
      }
      const dx = target.x - actor.x, dy = target.y - actor.y, dist = Math.hypot(dx, dy);
      if (planted) {
        actor.vx = 0; actor.vy = 0;
      } else if (dist > .012) {
        const maxSpeed=env.level().speed*env.playerModifier(actor,'footwork');
        const speed = Math.min(maxSpeed, dist * 7);
        const rallyStrategy=strategy&&env.state.phase==='rally'&&env.state.ball.shotType!=='serve';
        const recovering=rallyStrategy?Math.max(strategy.pressure*strategy.recoveryLeft/Math.max(.001,strategy.recoveryDuration),
          .65*env.clamp(strategy.turnLeft/.30,0,1),
          .60*(strategy.readPressure||0)*env.clamp(strategy.responseLeft/.45,0,1)):0;
        // PRO keeps lateral sprint speed. Front/back travel has its own court
        // scale, and a difficult save costs initial balance rather than a freeze.
        const depthSpeed=rallyStrategy?(env.isLegend()
          ?(dy>0?.66:strategy.lobRetreat&&env.state.ball.shotType==='lob'?.56:.95)
          :(dy>0?.55:strategy.lobRetreat&&env.state.ball.shotType==='lob'?.46:.90)):1;
        env.steerMovement(actor,dx/dist*speed*(1-.22*recovering),dy/dist*speed*depthSpeed*(1-.30*recovering),maxSpeed,(env.isLegend()?10.5:9)*(1-.55*recovering),dt);
      } else {
        const braking=env.playerProfile(actor)?.movement?.braking??1;
        actor.vx *= Math.max(0, 1 - dt * 10*braking); actor.vy *= Math.max(0, 1 - dt * 10*braking);
      }
      actor.x = env.clamp(actor.x + actor.vx * dt, -1.06, 1.06);
      actor.y = env.clamp(actor.y + actor.vy * dt, -1.22, serving ? -.99 : -.14);
    }

  // match-engine.js l.1310
  function copyAIRunner(actor=env.state.ai) {
      return actor.pro?{...actor,pro:{...actor.pro}}:{...actor};
    }

  // match-engine.js l.1314
  function proBalanceLoad(q=env.state.ai.pro) {
      if(env.isLegend())return q?env.clamp((q.pressure-.44)/.56,0,1)*env.clamp((q.balanceLeft||0)/.55,0,1):0;
      return q?env.clamp((q.pressure-.40)/.60,0,1)*env.clamp((q.balanceLeft||0)/.55,0,1):0;
    }

  // match-engine.js l.1319
  function proContactPressure(actor: any,ball: any,quality: any) {
      if(!env.isPro()||ball.shotType==='serve')return 0;
      const reach=env.level().reach*env.strokes.select(actor,ball).reachScale;
      const stretch=env.clamp((env.racketDistance(actor,ball)/reach-.42)/.58,0,1);
      const retreat=env.clamp((-actor.y-.87)/.28,0,1);
      const late=env.clamp((actor.swingAge-.22)/.09,0,1);
      const pace=env.clamp((env.physics.speedKph(ball)-52)/60,0,1);
      const speed=Math.hypot(actor.vx,actor.vy);
      const turning=env.clamp((speed-.35)/.85,0,1)*stretch;
      const wide=env.clamp((Math.abs(actor.x)-.60)/.40,0,1);
      const overheadRetreat=actor.pro?.lobRetreat?env.clamp((-actor.vy-.10)/.45,0,1):0;
      return env.clamp(.34*stretch+.25*retreat+.16*late+.20*turning+.12*wide+
        .30*overheadRetreat+.24*pace*Math.max(stretch,retreat,.25*(1-quality)),0,1);
    }

  // match-engine.js l.1334
  function recordProContact(pressure: any) {
      const ai=env.state.ai,q=ai.pro;
      if(!q)return;
      q.pressure=pressure;
      q.shortChase=null;
      q.lobRetreat=false;q.turnLeft=0;
      q.recoveryDuration=pressure>.16?.16+.64*pressure:0;
      q.recoveryLeft=q.recoveryDuration;
      // A difficult save leaves a recovery stance until the following exchange.
      // This is separate from the brief impact slowdown: floating a safe reply
      // must not erase every consequence before the human can play another ball.
      q.balanceLeft=pressure>.40?2.0+.6*pressure:0;
      q.contactX=ai.x;
      q.readPressure=0;q.responseLeft=0;
      const deep=env.clamp((-ai.y-.91)/.25,0,1);
      q.depthHold=deep>.12?1.45+deep*.9:0;
      q.depth=-.87-.23*deep;
      q.coverBias=(env.seeded(Math.floor(env.state.time*631)+env.state.rallyHits*37)-.5)*(.045+.16*pressure);
      if(env.isLegend()){
        q.recoveryDuration*=.75;q.recoveryLeft=q.recoveryDuration;
        q.balanceLeft=pressure>.46?1.65+.45*pressure:0;
        q.depthHold=deep>.12?.90+deep*.65:0;
        q.depth=-.87-.19*deep;q.coverBias*=.60;
      }
    }

  // match-engine.js l.1360
  function readProPattern() {
      const q=env.state.ai.pro;
      if(!q)return;
      if(env.isLegend()){readLegendPattern(q);return;}
      // Only previously observed ball flights inform the commitment. Never use
      // queued input or reroll the recovery location during an exchange.
      const recent=q.history.slice(-4),lanes=recent.map((h: any)=>h.lane);
      const lane=lanes.length>=2&&lanes.slice(-2).every((x: any)=>x===lanes.at(-1))?lanes.at(-1):0;
      q.anticipationX=lane*.11;
      q.expectShort=recent.length>=3&&recent.filter((h: any)=>h.shot==='short').length>=2;
    }

  // match-engine.js l.1372
  function readLegendPattern(q: any) {
      // Learn transitions between completed shots, including deep → drop and
      // alternating corners. Commit to a prediction, so changing the pattern
      // can still catch the defender leaning the wrong way.
      const recent=q.history.slice(-12),last=recent.at(-1);
      if(!last){q.anticipationX=0;q.expectShort=false;q.expectLob=false;return;}
      const lanes: any[]=[],shots: any[]=[];
      for(let i=1;i<recent.length;i++){
        if(recent[i-1].lane===last.lane)lanes.push(recent[i].lane);
        if(recent[i-1].shot===last.shot)shots.push(recent[i].shot);
      }
      const predict=(values: any)=>{
        const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
        const best=[...counts].sort((a: any,b: any)=>b[1]-a[1])[0];
        return best&&best[1]>=2&&best[1]/values.length>=.65?best[0]:null;
      };
      const lane=predict(lanes);
      const repeated=recent.length>=2&&recent.at(-2).lane===last.lane?last.lane:0;
      q.anticipationX=(lane??repeated)*.13;
      q.expectShort=predict(shots)==='short'||recent.slice(-4).filter((h: any)=>h.shot==='short').length>=2;
      q.expectLob=recent.slice(-6).filter((h: any)=>h.shot==='lob').length>=2;
    }

  // match-engine.js l.1395
  function canReachAITarget(target: any, time: any, windup: any, margin: any) {
      const ai=env.state.ai,travelTime=time-windup;
      if(travelTime<=0 || Math.hypot(target.x-ai.x,target.y-ai.y)>
        env.level().speed*env.playerModifier(ai,'footwork')*travelTime+margin)return false;
      const runner=copyAIRunner(ai),recovery=aiRecoveryTarget();
      // Use the real mover, including current momentum and recovery during
      // the read delay. Overheads/volleys reserve a planted preparation.
      for(let elapsed=0;elapsed<travelTime;){
        const dt=Math.min(1/60,travelTime-elapsed);
        const waiting=elapsed+dt<ai.reactionTimer;
        const destination=waiting?(env.state.ball.isServe?{x:ai.x,y:ai.y}:recovery):target;
        moveAI(runner,destination,dt);
        elapsed+=dt;
      }
      return Math.hypot(target.x-runner.x,target.y-runner.y)<=margin;
    }

  // match-engine.js l.1412
  function aceSwingContact(dt: any, running: any, allowSmash: any, defensive = false) {
      const step = dt || 1 / 60, incoming = {...env.state.ball}, runner = copyAIRunner();
      const target = {x: env.state.ai.targetX, y: env.state.ai.targetY};
      // The current frame has already moved the runner. Try a planted swing
      // first, then a groundstroke prepared while chasing a wide ball. Both
      // keep the normal wind-up, movement limits and racket contact window.
      for (let frame = 0; frame * step <= .29 + 1e-9; frame++) {
        const age = frame * step;
        if (frame > 0) moveAI(runner, target, step, !running && age < env.SHOT.contactOpens);
        advanceReturnPrediction(incoming, step);
        if (!incoming.active) return null;
        if (age >= env.SHOT.contactOpens && canPrepareAceReturn(runner, incoming, defensive) &&
          (env.strokes.select(runner, incoming).kind !== 'smash' || !running && allowSmash)) return (frame + 1) * step;
      }
      return null;
    }

  // match-engine.js l.1429
  function proBalancedContactAhead(actor: any, dt: any) {
      const step = dt || 1 / 60, incoming = {...env.state.ball}, runner = copyAIRunner(actor);
      const target = {x: actor.targetX, y: actor.targetY};
      // The live contact is already legal. Wait only if the committed movement
      // can still produce a balanced shot before this swing's contact window ends.
      for (let age = actor.swingAge + step; age <= .29 + 1e-9; age += step) {
        moveAI(runner, target, step);
        advanceReturnPrediction(incoming, step);
        if (!incoming.active) return false;
        if (canPrepareAceReturn(runner, incoming)) return true;
      }
      return false;
    }

  // match-engine.js l.1443
  function proCanWaitForBalancedReturn(dt: any) {
      const step = dt || 1 / 60, incoming = {...env.state.ball}, runner = copyAIRunner();
      const target = {x: runner.targetX, y: runner.targetY};
      // A fallback must not start early just because a better contact falls
      // beyond a swing started now. Continue the same pursuit and leave enough
      // time to prepare that later running groundstroke normally.
      for (let frame = 0; frame * step <= .9; frame++) {
        if (frame > 0) moveAI(runner, target, step);
        advanceReturnPrediction(incoming, step);
        if (!incoming.active) return false;
        if (frame * step > .29 && canPrepareAceReturn(runner, incoming) &&
            ['forehand', 'backhand'].includes(env.strokes.select(runner, incoming).kind)) return true;
      }
      return false;
    }

  // match-engine.js l.1459
  function netVolleyTarget(ball: any) {
      if (!env.usesNetTactics() || !env.state.ai.tactics?.net || ball.isServe ||
          ball.lastHit !== 'player' || ball.vy >= 0 || ball.bounceCount !== 0) return null;
      const ai = env.state.ai, predicted = {...ball}, step = 1 / 60;
      const windup = env.preparedCPU() ? env.SHOT.contactOpens : .075;
      // Look for an actually reachable interception before the bounce. Use the
      // same speed, reaction delay, wind-up and contact height as ordinary play.
      for (let time = step; time <= .9; time += step) {
        advanceReturnPrediction(predicted, step);
        if (!predicted.active || predicted.bounceCount) return null;
        if (time < windup + ai.reactionTimer + .08 || predicted.y > -.16 ||
            predicted.y < -.68 || predicted.z < .12 || predicted.z > env.level().maxHitZ || Math.abs(predicted.x) > env.SINGLES_X) continue;
        const target = {x: predicted.x, y: env.clamp(predicted.y - .04, -.72, -.18)};
        if (canReachAITarget(target,time,windup,.06)) return target;
      }
      return null;
    }

  // match-engine.js l.1477
  function contactTarget(ball: any, side: any) {
      if (side === 'ai') {
        const overhead = overheadTarget(ball);
        if (overhead) return overhead;
        const volley = netVolleyTarget(ball);
        if (volley) return volley;
      }
      let target;
      // Ace needs room behind the bounce for its full swing preparation.
      const ace = side === 'ai' && env.preparedCPU();
      const early = side === 'ai' && !ace && ball.shotType !== 'serve';
      if (ball.bounceCount === 0) {
        const bounce = { ...env.physics.landing(ball), shotType: ball.shotType, bounceCount: 0,
          ...(ball.proDrop?{proDrop:ball.proDrop}:{}) };
        env.physics.rebound(bounce, env.state.venue);
        target = env.physics.sample(bounce, Math.min(early ? .085 : .17, env.physics.timeToGround(bounce) * .38));
      } else {
        target = env.physics.sample(ball, Math.min(ace ? .16 : early ? .065 : .10, env.physics.timeToGround(ball) * .35));
      }
      return { x: env.clamp(target.x, -1.02, 1.02), y: side === 'player' ? env.clamp(target.y, .17, 1.18) : env.clamp(target.y, -1.18, -.17) };
    }

  // match-engine.js l.1499
  function scheduleAIRead() {
      const ai = env.state.ai, cfg = env.level();
      if(env.state.ball.shotType==='serve'&&env.state.ball.lastHit==='player'){
        const serve=SERVE_CPU[env.state.difficulty],seed=Math.floor(env.state.time*100000)+env.state.serveSequence*8191+71;
        ai.reactionTimer=env.lerp(serve.reaction[0],serve.reaction[1],env.seeded(seed+211));
        ai.serveRead={at:env.state.time,nextAt:env.state.time+serve.observe,previous:{x:env.state.ball.x,y:env.state.ball.y,z:env.state.ball.z,
          bounceCount:0,time:env.state.time},observed:null,observedAt:env.state.time,
          errorX:(env.seeded(seed+223)*2-1)*serve.error/5.018,
          errorY:(env.seeded(seed+227)*2-1)*serve.error/11.885,
          speedError:(env.seeded(seed+229)*2-1)*serve.error*.12};
        ai.readTarget={x:ai.x,y:ai.y};ai.trackingTimer=serve.observe;
        if(ai.pro)ai.pro.shortChase=null;
        return;
      }
      delete ai.serveRead;
      ai.reactionTimer = cfg.delay;
      if(ai.pro)ai.pro.shortChase=null;
      if(env.isPro()&&ai.pro&&env.state.ball.shotType!=='serve'){
        readProPattern();
        const q=ai.pro;
        q.lobRetreat=env.state.ball.shotType==='lob'&&ai.y>-.62;
        q.turnLeft=q.lobRetreat?.16+env.clamp(ai.vy,0,1)*.18:0;
        const load=proBalanceLoad(q),dx=env.state.ball.targetX-ai.x;
        const wrongFoot=dx*ai.vx<-.035?env.clamp((Math.abs(ai.vx)-.18)/.75,0,1):0;
        const wrongLane=q.anticipationX*dx<-.025?1:0;
        const wrongDepth=q.expectShort&&env.state.ball.shotType==='deep'&&ai.y>-.82?1:0;
        // Only a completed shot can expose a bad commitment. Routine reads keep
        // PRO's speed; stretched saves and wrong guesses cost the next first step.
        ai.reactionTimer+=env.isLegend()
          ?.038*load+.045*Math.max(wrongLane,wrongDepth)+.050*wrongFoot
          :.050*load+.055*Math.max(wrongLane,wrongDepth)+.060*wrongFoot;
        q.readPressure=Math.max(load,.75*wrongFoot,.55*Math.max(wrongLane,wrongDepth));
        q.responseLeft=q.readPressure>0?.45+.30*q.readPressure:0;
        q.turnLeft=Math.max(q.turnLeft,wrongFoot>.1?.22+.22*wrongFoot:0);
        if(env.state.ball.shotType==='short'){
          // Measure the chase from the completed shot, before the CPU moves.
          // The same drop is routine into a covered lane and demanding after
          // a corner-to-corner exchange. Use the real bounce and movement scale;
          // this estimate influences the reply, never grants reach or a miss.
          const b=env.state.ball,bounce={...env.physics.landing(b),shotType:'short',
            proDrop:b.proDrop,bounceCount:0};
          env.physics.rebound(bounce,env.state.venue);
          const bounceTime=env.physics.timeToGround(bounce);
          const target=env.physics.sample(bounce,bounceTime*.38);
          const dx=target.x-ai.x,dy=target.y-ai.y;
          const depthSpeed=dy>0?(env.isLegend()?.66:.55):(env.isLegend()?.95:.90);
          const speed=cfg.speed*env.playerModifier(ai,'footwork');
          const distance=Math.hypot(dx,dy/depthSpeed);
          const opposition=env.clamp(-(dx*ai.vx+dy*ai.vy)/Math.max(.001,Math.hypot(dx,dy)*speed),0,1);
          const requiredTime=Math.max(0,distance-.13)/speed+.09+
            opposition*.18+load*.12;
          const availableTime=Math.max(.05,env.physics.timeToGround(b)+bounceTime*.80-ai.reactionTimer);
          q.shortChase={x:ai.x,y:ai.y,requiredTime,availableTime,
            pressure:env.clamp((requiredTime/availableTime-.75)/.35,0,1)};
        }
        q.history.push({lane:Math.abs(env.state.ball.targetX)>.24?Math.sign(env.state.ball.targetX):0,shot:env.state.ball.shotType});
        if(q.history.length>(env.isLegend()?12:6))q.history.shift();
      }
      ai.trackingTimer = 0;
      if (env.usesNetTactics() && ai.tactics?.net) {
        const b = env.state.ball, landing = env.physics.landing(b);
        const apex = b.z + Math.max(0, b.vz) ** 2 / (2 * env.GRAVITY);
        // A deep lob beats the approach: turn and chase instead of camping at net.
        if (apex > 1.15 && landing.y < -.65) ai.tactics.net = false;
      }
      ai.readErrorX = (env.seeded(Math.floor(env.state.time * 1291) + 31) - .5) * cfg.error;
      ai.readErrorY = (env.seeded(Math.floor(env.state.time * 887) + 71) - .5) * cfg.error * .55;
    }

  // match-engine.js l.1568
  function aiRecoveryTarget() {
      // Cover both baseline corners until the opponent hits. Sending the ball
      // wide must not automatically commit us to the opposite, cross-court lane.
      // Stay deeper behind a deep shot, step inside after a short one.
      const b = env.state.ball;
      if (env.usesNetTactics() && env.state.ai.tactics?.net) {
        const lane = b.lastHit === 'ai' && b.targetX !== null ? b.targetX : env.state.player.x;
        return {x: env.clamp(lane * .42, -.32, .32), y: env.isPro() ? -.26 : env.state.difficulty === 'club' ? -.30 : -.34};
      }
      const x = b.lastHit === 'ai' && b.targetX !== null ? b.targetX : env.state.player.x;
      const depth = b.lastHit === 'ai' && b.targetY !== null ? b.targetY : .75;
      const target={ x: 0, y: depth < .45 ? -.61 : -.87 };
      // A slight cross-court lean is useful, but the old 30% commitment left
      // the line open even after a complete recovery. Keep the base position
      // close to centre; pressure and observed patterns can still displace it.
      target.x=env.clamp(-x*.10,-.08,.08);
      const q=env.isPro()?env.state.ai.pro:null;
      if(q){
        // The recovering player shades the side of a demanding contact instead
        // of always completing an ideal centre recovery behind a slow reply.
        target.x=env.clamp(target.x+q.coverBias+q.anticipationX+(q.contactX||0)*(env.isLegend()?.22:.30)*proBalanceLoad(q),-.46,.46);
        if(q.depthHold>0)target.y=Math.min(target.y,env.lerp(-.87,q.depth,env.clamp(q.depthHold/.65,0,1)));
        if(q.expectShort)target.y=Math.max(target.y,-.70);
      }
      return target;
    }

  // match-engine.js l.1595
  function updateAI(dt: any) {
      const ai = env.state.ai;
      const cfg = env.level();

      if(env.state.phase==='rally'&&env.state.ball.shotType==='serve'&&env.state.ball.lastHit==='player'){
        updateServeReceiver(dt);return;
      }

      const recovery = aiRecoveryTarget();
      let tx = recovery.x;
      let ty = recovery.y;
      if (env.state.phase === 'rally' && env.state.ball.vy < 0) {
        ai.reactionTimer = Math.max(0, ai.reactionTimer - dt);
        if (ai.reactionTimer > 0) {
          // Await the serve from the receiving stance. Rally recovery would
          // pull the receiver toward the centre before it can read a wide serve.
          tx = env.state.ball.isServe ? ai.x : recovery.x;
          ty = env.state.ball.isServe ? ai.y : recovery.y;
        } else {
          // Ace commits to a read briefly instead of correcting its intercept
          // every frame. A change of depth or direction can leave an opening.
          ai.trackingTimer = Math.max(0, (ai.trackingTimer || 0) - dt);
          if (!env.preparedCPU() || ai.trackingTimer <= 0 && !(ai.swing > 0 && !ai.strokeConnected)) {
            const landing = contactTarget(env.state.ball, 'ai');
            ai.readTarget = {x: env.clamp(landing.x + ai.readErrorX, -1.02, 1.02),
              y: env.clamp(landing.y + ai.readErrorY, -1.18, -.18)};
            ai.trackingTimer = env.isLegend()?.11:.14;
          }
          tx = ai.readTarget.x;
          ty = ai.readTarget.y;
        }
      } else if (env.state.phase === 'serve' || env.state.phase === 'serveToss' || env.state.phase === 'serveFault') {
        const geometry = env.getServeGeometry(env.state.server);
        if (env.state.server === 'ai') {
          tx = geometry.serverX;
          ty = -1.035;
        } else {
          tx = geometry.receiverX+serveAnticipation(geometry);
          ty = -serveReceiverDepth();
        }
      }
      // The read timer already models reaction. Smoothing the target as well
      // added a second delay and made the same wide return an automatic winner.
      // Acceleration below still limits every step of the actual player.
      ai.targetX = tx;
      ai.targetY = ty;
      const planted = env.preparedCPU() && !ai.runningSwing && ai.swing > 0 && !ai.strokeConnected && ai.swingAge < env.SHOT.contactOpens;
      const aiServing = (env.state.phase === 'serve' || env.state.phase === 'serveToss') && env.state.server === 'ai';
      moveAI(ai, {x: tx, y: ty}, dt, planted, aiServing);
      env.updateLocomotion(ai, dt);

      if (env.state.phase === 'rally' && env.state.ball.vy < 0 && ai.swingCooldown <= 0 && ai.reactionTimer <= 0 && !(env.state.ball.isServe && env.state.ball.bounceCount === 0)) {
        const reach = cfg.reach;
        const incoming = {...env.state.ball};
        const ace = env.preparedCPU();
        const d = Math.hypot((incoming.x - ai.x) * 1.06, incoming.y - ai.y);
        const windup = env.preparedCPU() ? env.SHOT.contactOpens : .075;
        const highBall = { ...env.state.ball, ...env.physics.sample(env.state.ball, windup) };
        const overhead = env.strokes.select(ai, highBall);
        const overheadDistance = Math.hypot((highBall.x - ai.x) * 1.05, highBall.y - ai.y);
        const canSmash = highBall.vz <= 0 && highBall.y < -.015 && highBall.y >= -1 && Math.abs(highBall.x) <= env.SINGLES_X &&
          overhead.kind === 'smash' && overhead.reachable && overheadDistance <= reach * overhead.reachScale;
        const canReturn = d < reach + .07 && incoming.z < cfg.maxHitZ && incoming.z > .04;
        let plantedContact = ace ? aceSwingContact(dt, false, canSmash) : null;
        let runningContact = ace && plantedContact === null ? aceSwingContact(dt, true, false) : null;
        if (env.isPro() && plantedContact === null && runningContact === null) {
          // Prefer a balanced swing, but use Ace's legal defensive pickup when
          // neither planted nor running preparation can reach a comfortable ball.
          plantedContact = aceSwingContact(dt, false, canSmash, true);
          runningContact = plantedContact === null ? aceSwingContact(dt, true, false, true) : null;
          if ((plantedContact !== null || runningContact !== null) && proCanWaitForBalancedReturn(dt)) {
            plantedContact = null;
            runningContact = null;
          }
        }
        // Do not stop a forward chase just because a planted last-chance scoop
        // is possible. A legal running preparation can meet the drop sooner.
        // Balanced shots and overheads retain their ordinary planted preference.
        if(env.isPro()&&incoming.shotType==='short'&&plantedContact!==null&&
            !canSmash&&ai.vy>.15&&ty>ai.y+.04&&plantedContact>.24){
          const movingContact=aceSwingContact(dt,true,false,true);
          if(movingContact!==null&&movingContact<=plantedContact){
            plantedContact=null;runningContact=movingContact;
          }
        }
        const contactTime = plantedContact ?? runningContact;
        if (ace ? contactTime !== null : canSmash || canReturn) {
          if (ace) ai.runningSwing = runningContact !== null;
          ai.swing = .42;
          ai.swingAge = 0;
          ai.strokeConnected = false;
          ai.swingCooldown = .46;
          ai.queuedShot = chooseAIShot();
          env.prepareStroke(ai, contactTime ?? windup);
        }
      }
    }

  // match-engine.js l.1693
  function predictObservedServe(read: any,time: any){
      if(!read.observed)return null;
      const ball={...read.observed};
      env.physics.advance(ball,Math.max(0,time-read.observedAt),env.state.venue,(kind: any,b: any)=>{
        if(kind==='net'||kind==='board'||kind==='bounce'&&b.bounceCount>=2)b.active=false;
        if(kind==='bounce')b.isServe=false;
      });
      return ball;
    }

  // match-engine.js l.1702
  function observeServe(read: any,time: any){
      const b=env.state.ball,previous=read.previous,elapsed=time-previous.time;
      if(elapsed<=1e-9)return;
      // Velocity is estimated from successive visible positions. A sample that
      // straddles a bounce continues the last observed arc until the next sample;
      // no target coordinates, input, error seed or future true ball is consulted.
      let vx,vy,vz;
      if(previous.bounceCount===b.bounceCount){
        const factor=-Math.expm1(-.09*elapsed)/.09,decay=Math.exp(-.09*elapsed);
        vx=(b.x-previous.x)/factor*decay;vy=(b.y-previous.y)/factor*decay;
        vz=(b.z-previous.z)/elapsed-env.GRAVITY*elapsed/2;
      }else{
        const projected=predictObservedServe(read,time);
        if(projected){vx=projected.vx;vy=projected.vy;vz=projected.vz;}
      }
      read.previous={x:b.x,y:b.y,z:b.z,bounceCount:b.bounceCount,time};
      if(!Number.isFinite(vx))return;
      read.observed={x:b.x+read.errorX,y:b.y+read.errorY,z:b.z,
        vx:vx*(1+read.speedError),vy:vy*(1+read.speedError),vz,
        bounceCount:b.bounceCount,active:true,crossedNet:b.crossedNet,isServe:b.isServe,
        shotType:'serve',lastHit:'player',serveOriginX:b.serveOriginX};
      read.observedAt=time;
    }

  // match-engine.js l.1725
  function updateServeReceiver(dt: any){
      const ai=env.state.ai,cfg=SERVE_CPU[env.state.difficulty];
      if(!ai.serveRead)scheduleAIRead();
      const read=ai.serveRead,time=env.state.time,sampleTime=env.state.time-dt;
      ai.reactionTimer=Math.max(0,ai.reactionTimer-dt);
      if(sampleTime+1e-9>=read.nextAt){observeServe(read,sampleTime);read.nextAt=sampleTime+cfg.observe;}
      const observed=predictObservedServe(read,time);
      if(ai.reactionTimer>0||!observed){moveAI(ai,{x:ai.x,y:ai.y},dt,true);env.updateLocomotion(ai,dt);return;}
      // Commit the running block to the last read while the racket is moving.
      // Fresh observations can inform a later attempt, not redirect this swing.
      if(observed.active&&!(ai.swing>0&&!ai.strokeConnected)){
        if(!read.intercept||read.planAt!==read.observedAt){
          read.intercept=observedServeIntercept(read,time);read.planAt=read.observedAt;
        }
        const target=read.intercept||contactTarget(observed,'ai');
        ai.readTarget={x:target.x,y:target.y};ai.targetX=target.x;ai.targetY=target.y;
      }
      moveAI(ai,ai.readTarget,dt);env.updateLocomotion(ai,dt);
      if(ai.swingCooldown>0||!observed.active)return;
      const incoming=predictObservedServe(read,time+cfg.block),runner=copyAIRunner(ai);
      for(let t=0;t<cfg.block-1e-9;t+=1/60)moveAI(runner,ai.readTarget,Math.min(1/60,cfg.block-t));
      if(!incoming?.active||incoming.bounceCount!==1||incoming.y>=-.015)return;
      const stroke=env.strokes.select(runner,incoming);
      const distance=Math.hypot((incoming.x-runner.x)*5.018,(incoming.y-runner.y)*11.885);
      if(!stroke.reachable||distance>env.SERVE.returnReachMetres*.94||incoming.z<.04||incoming.z>env.level().maxHitZ)return;
      ai.runningSwing=true;ai.swing=.34;ai.swingAge=0;ai.strokeConnected=false;ai.swingCooldown=.40;
      const seed=Math.floor(time*971)+env.state.serveSequence*7919;
      const gaussian=env.clamp(Math.sqrt(-2*Math.log(Math.max(.000001,env.seeded(seed+31))))*Math.cos(env.TAU*env.seeded(seed+67)),-2.5,2.5);
      ai.serveContactAge=Math.max(.04,cfg.block+gaussian*cfg.returnSD);
      ai.queuedShot='neutral';ai.stroke=stroke.kind;ai.racketSide=stroke.racketSide;
      ai.strokeContactAge=ai.serveContactAge;ai.strokeContactZ=incoming.z;
    }

  // match-engine.js l.1757
  function observedServeIntercept(read: any,time: any){
      let best=null,score=Infinity;
      // Search the uncertain, previously observed arc. A wide serve must be met
      // before it runs into the alley; a fixed point behind every bounce cannot
      // represent that choice. Every candidate uses the normal accelerated mover.
      const swinging=env.state.ai.swing>0&&!env.state.ai.strokeConnected;
      const block=SERVE_CPU[env.state.difficulty].block;
      const contactAge=env.state.ai.serveContactAge||block;
      const firstLead=swinging?Math.max(.001,contactAge-env.state.ai.swingAge):block;
      for(let lead=firstLead;lead<=(swinging?contactAge+env.SERVE.returnContactHalfWindow-env.state.ai.swingAge:.72)+1e-9;lead+=.025){
        const ball=predictObservedServe(read,time+lead);
        if(!ball?.active)break;
        if(ball.bounceCount!==1||ball.z<.04||ball.z>env.level().maxHitZ)continue;
        const target={x:env.clamp(ball.x,-1.06,1.06),y:env.clamp(ball.y,-1.18,-.17)},runner=copyAIRunner();
        for(let t=0;t<lead;t+=1/60)moveAI(runner,target,Math.min(1/60,lead-t));
        const distance=Math.hypot((ball.x-runner.x)*5.018,(ball.y-runner.y)*11.885);
        if(distance<env.SERVE.returnReachMetres*.90)return target;
        const cost=distance+lead*.10;
        if(cost<score){score=cost;best=target;}
      }
      return best;
    }

  // match-engine.js l.1792
  function chooseAIShot() {
      const b = env.state.ball, p = env.state.player;
      const draw = env.seeded(Math.floor(env.state.time * 733));
      // Use a drop only from a ball we can attack, against a deep receiver.
      if (env.state.rallyHits >= 4 && b.y > -.92 && b.z > .12 && p.y > .74 && draw > .48) return 'short';
      if (p.y < .65 || b.y < -.92) return 'deep';
      return draw > .48 ? 'deep' : 'neutral';
    }

  // match-engine.js l.1801
  function canContinueNet(quality: any, plan: any) {
      const ai=env.state.ai,b=env.state.ball;
      // A first volley often happens before the established-net depth cutoff.
      // Carry a real approach through that transition, but abandon a pressured
      // save or retreat. Shot direction alone is not a reason to go back.
      return env.usesNetTactics() && !!ai.tactics?.net && plan.shot!=='lob' &&
        !['reset','pressure-reset','recovery-lob'].includes(plan.name) &&
        quality>.32 && b.z>.12 && ai.y>-.78 && b.y>-.78 &&
        Math.abs(ai.x)<.84 && (ai.vy>-.18 || ai.y>-.46 && b.y>-.55) &&
        proContactPressure(ai,b,quality)<(env.isLegend()?.60:.40);
    }

  // match-engine.js l.1813
  function basicNetPlan(quality: any, receiverX: any, side: any) {
      const ai=env.state.ai,b=env.state.ball,p=env.state.player;
      if (!env.usesNetTactics() || env.isPro()) return null;
      const easy=env.state.difficulty==='beginner';
      if(canContinueNet(quality,{shot:'neutral'}))
        return {name:'net-drive',shot:'neutral',x:side*(easy?.43:.57),pace:easy?.06:.02,net:true};
      // Lower levels see only obvious short-ball openings, and still miss some.
      // The choice is made once at contact; no extra pace or reach is granted.
      if(ai.tactics?.net || quality<(easy?.40:.36) || b.z<.18 ||
          b.y<(easy?-.62:-.72) || Math.abs(ai.x)>.58 || ai.vy<-.15 ||
          p.y<.70 || p.vy<-.20 || !(p.y>.92 || Math.abs(receiverX)>.35)) return null;
      const seed=Math.floor(env.state.time*733)+env.state.rallyHits*197+(ai.tactics?.shots||0)*89;
      if(env.seeded(seed+359)>=(easy?.14:.34)*netPreference()) return null;
      return {name:'approach',shot:'deep',x:side*(easy?.46:.62),pace:easy?.02:-.04,net:true};
    }

  // match-engine.js l.1829
  function netReplyPlan(quality: any) {
      const b=env.state.ball,p=env.state.player,ai=env.state.ai;
      if(p.y>=.60)return null;
      const smooth=(value: any)=>{const t=env.clamp(value,0,1);return t*t*(3-2*t);};
      const seed=Math.floor(env.state.time*733)+env.state.rallyHits*197+(ai.tactics?.shots||0)*89;
      const receiverX=env.clamp(p.x+p.vx*.18,-.95,.95);
      // Placement has its own draw: choosing a rare shot must not fix its lane.
      const open=Math.abs(receiverX)>.10?-Math.sign(receiverX):(env.seeded(seed+127)<.5?-1:1);
      const width=env.state.difficulty==='beginner'?.48:env.state.difficulty==='club'?.68:.75;
      const drive=env.isPro()&&Math.abs(ai.y)<=PRO_POSITION.deepOutWithin?'neutral':'deep';
      const stroke=env.strokes.select(ai,b);
      const pressure=proContactPressure(ai,b,quality);
      const holdNet=env.isPro()&&ai.y>-.46&&b.y>-.55&&quality>.48&&pressure<.30&&
        (stroke.kind.endsWith('-volley')||stroke.kind==='smash');
      const pass={name:'pass',shot:drive,x:open*width,pace:env.state.difficulty==='beginner'?-.06:-.10,net:holdNet};
      const depth=drive==='deep'?.90:.69;
      const groundTime=drive==='deep'?env.lerp(1.17,.86,quality):env.lerp(1.10,.81,quality);
      const flight=env.strokes.flightTime(stroke.kind,b,pass.x,depth,groundTime,quality,drive);
      const trajectory=env.shotTrajectory(b,pass.x,depth,flight+env.level().paceRelief+pass.pace,
        {...ai,stroke:stroke.kind,queuedShot:drive},false);
      const interceptTime=env.physics.timeToY(trajectory,p.y);
      const intercept=env.physics.sample(trajectory,interceptTime);
      // Estimate the available passing lane at the receiver, not at the bounce.
      // This is a coarse visible-motion read, not a prediction of their controls.
      const coverX=env.clamp(p.x+p.vx*Math.min(.25,interceptTime),-1.06,1.06);
      const coverMetres=env.level().humanReach*5.018+3.4*env.playerModifier(p,'footwork')*Math.max(0,interceptTime-.20);
      const covered=env.clamp(1-Math.abs(intercept.x-coverX)*5.018/coverMetres,0,1);
      const near=smooth((.60-p.y)/.42);
      const forward=env.clamp(-p.vy/.8,-1,1);
      const lift=smooth((quality-.40)/.32)*smooth((b.z-.08)/.16)*
        smooth((ai.y+1.08)/.25)*smooth((.92-Math.abs(ai.x))/.30)*(1-.7*pressure);
      const lobTime=env.strokes.highDeepLobPlan(b,open*.48,'ai').time;
      const chaseTime=Math.max(0,.92-p.y)*11.885/(5.5*env.playerModifier(p,'footwork'))+Math.max(0,-p.vy)*.20;
      const chaseLoad=env.clamp(chaseTime/lobTime,0,1.25);
      const recognition=(({beginner:.14,club:.20,ace:.24,pro:.30,legend:.34}) as Record<string, number>)[env.state.difficulty];
      // Remember several completed contacts. A pass between lobs does not erase
      // the recent lob, and repeated passes never force a lob in compensation.
      const history=ai.netShotHistory;
      const recentLobs=history?history.reduce((sum: any,name: any,i: any)=>sum+(name==='lob'?.72**(history.length-1-i):0),0)
        :Math.max(ai.lobRepeats||0,ai.tactics?.last==='lob'?ai.tactics.repeats:0);
      const variety=1/(1+1.8*recentLobs);
      const lobChance=stroke.kind==='smash'?0:Math.min(.48,recognition*near*(1+.65*forward)*
        lift*(.8+.6*covered)*(.65+.35*chaseLoad)*variety);
      const draw=env.seeded(seed+31);
      if(draw<lobChance)return {name:'lob',shot:'lob',x:open*.48,pace:0,net:false};

      // A covered lane sometimes calls for a dipping ball and another volley.
      // Only offer it when the ordinary solver actually produces a low arrival.
      if(stroke.kind!=='smash'&&quality>.48&&b.z>.16){
        const targetY=env.clamp(p.y+.035,.18,.62),targetX=env.clamp(receiverX,-.64,.64);
        const time=Math.hypot((targetX-b.x)*5.018,(targetY-b.y)*11.885)/(16+4*quality);
        const feet=env.shotTrajectory(b,targetX,targetY,time,{...ai,stroke:stroke.kind,queuedShot:'neutral'},false);
        const arrival=env.physics.sample(feet,env.physics.timeToY(feet,p.y));
        const feetChance=recognition*.65*near*covered;
        if(arrival.z>env.physics.RADIUS&&arrival.z<.38&&draw<lobChance+feetChance)
          return {name:'feet',shot:'neutral',x:targetX,depth:targetY,time,pace:0,net:holdNet};
      }
      return pass;
    }

  // match-engine.js l.1889
  function legendShotPlan(quality: any) {
      const b=env.state.ball,p=env.state.player,ai=env.state.ai,q=ai.pro;
      const tactics=ai.tactics||{shots:0};
      const style=cpuStyle();
      const seed=Math.floor(env.state.time*733)+env.state.rallyHits*197+tactics.shots*89;
      const receiverX=env.clamp(p.x+p.vx*.18,-.95,.95);
      const open=Math.abs(receiverX)>.08?-Math.sign(receiverX):(env.seeded(seed+127)<.5?-1:1);
      const cross=Math.abs(b.x)>.12?-Math.sign(b.x):open;
      const pressure=proContactPressure(ai,b,quality);
      const drive=Math.abs(ai.y)<=PRO_POSITION.deepOutWithin?'neutral':'deep';
      const atNet=ai.y>-.46&&b.y>-.55;
      if(b.shotType==='short'&&b.bounceCount>0&&b.y>-.65){
        // A covered low ball can be controlled. Counterdrop only when the human
        // stays deep; forced recovery lobs are selected from the actual chase.
        if(p.y>.90&&p.vy>=0&&quality>.36&&pressure<.68&&
            tactics.last!=='counter-drop'&&env.seeded(seed+431)<.28)
          return {name:'counter-drop',shot:'short',x:open*.55,pace:.03,net:false};
      }
      if(pressure>.60||q?.lobRetreat&&(ai.runningSwing||ai.vy<-.15)){
        return {name:'pressure-reset',shot:pressure>.80?'neutral':drive,
          depth:env.lerp(.96,.85,env.clamp((pressure-.60)/.38,0,1)),
          x:open*(.60-.10*pressure),pace:-.02+.08*pressure,net:false};
      }
      // Depth alone is not a loss of balance. A clean baseline contact can
      // counterdrive; reserve a soft reset for genuinely awkward pickups.
      if(quality<.26||b.y<-1.19||Math.abs(ai.x)>.98||b.z<.075)
        return {name:'reset',shot:drive,x:open*.54,depth:.94,pace:.055,net:false};
      const netReply=netReplyPlan(quality);
      if(netReply)return netReply;

      // Score only visible geometry, movement and known player attributes. The
      // receiver's pending controls and the eventual point outcome are unknown.
      const ratings=env.playerProfile(p)?.ratings;
      const weaker=ratings?Math.sign(ratings.backhand-ratings.forehand):0;
      const wingGap=ratings?Math.abs(ratings.backhand-ratings.forehand):0;
      const centralPattern=q?.history.slice(-3).filter((h: any)=>h.lane===0&&h.shot!=='short'&&h.shot!=='lob').length===3;
      const candidates: any[]=[];
      const add=(name: any,shot: any,x: any,pace: any,base: any,net=false)=>{
        const y=shot==='short'?.27:shot==='lob'?.92:shot==='neutral'?.69:drive==='deep'?.93:.69;
        const travel=Math.hypot(x-receiverX,(y-p.y)*1.5);
        const weakWing=shot!=='short'&&shot!=='lob'&&Math.sign(x-receiverX)===weaker?wingGap*.12:0;
        const repetition=tactics.last===name?(tactics.repeats>=2?.22:.08):0;
        candidates.push({name,shot:shot==='deep'?drive:shot,x,pace,net,
          ...(shot==='deep'&&drive==='deep'?{depth:.93}:{}),
          value:base+travel*.8+weakWing-repetition});
      };
      {
        const attackable=quality>.48&&b.y>-.92&&b.z>.16;
        const pace=attackable?-.13:-.06;
        add('open-court','deep',open*.76,pace,1.45,atNet);
        // The construction ball has visible margin inside the sideline. Merely
        // naming a second almost-identical wide drive "crosscourt" hides style.
        add('crosscourt','deep',cross*(style?.56:.70),pace+.035,style?1.38:1.2,atNet);
        if(weaker&&wingGap>=1)
          add('weaker-wing','deep',env.clamp(receiverX+weaker*.40,-.73,.73),pace+.02,1.18);
        if(Math.abs(p.vx)>.3&&p.x*p.vx<-.04)
          add('wrong-foot','deep',Math.sign(p.x)*.70,pace,1.75+Math.abs(p.vx)*.25,atNet);
        // A drop or net rush has to exploit an actual positional advantage.
        // Repeated lobs discourage approaching until a much shorter ball arrives.
        // Repeated central drives offer a safe change of depth. Recognize the
        // completed pattern instead of waiting for a rally-length error lottery.
        const changeDepth=centralPattern&&quality>.40&&b.y>-.92&&b.z>.10;
        // Ordinary prepared contacts often occur around z=.15. Touch and a
        // controlled approach need balance, not the height of an attacking drive.
        // Pressure already measures racket stretch, turning, pace and retreat.
        const extension=env.racketDistance(ai,b)/(env.level().reach*env.strokes.select(ai,b).reachScale);
        const balanced=style&&quality>.33&&pressure<.50&&b.z>.115&&b.y>-.94&&
          extension<.90&&Math.abs(ai.x)<.86&&ai.vy>-.12&&!q?.lobRetreat;
        const touch=balanced&&p.y>.76&&p.vy>-.12&&env.state.rallyHits>=5&&
          (Math.abs(receiverX)>.16||tactics.shots>=2);
        if(balanced&&!atNet&&p.y>.65)
          add('change-pace','neutral',open*.55,.055,.96);
        if(((attackable||changeDepth)&&p.y>(centralPattern?.72:.91)&&p.vy>-.15&&env.state.rallyHits>=3)||touch)
          add('drop','short',open*.59,.01,.55+env.dropShotSuccess(ai)*.55,Math.abs(ai.x)<.60);
        const buildApproach=balanced&&quality>.38&&pressure<.46&&!atNet&&b.y>-.90&&
          p.y>.72&&p.vy>-.20&&env.state.rallyHits>=3&&
          (Math.abs(receiverX)>.20||tactics.pattern==='all-court'&&Math.abs(open*.73-receiverX)>.58);
        const shortApproach=quality>.40&&b.z>.12&&!atNet&&Math.abs(ai.x)<.58&&
            (attackable&&b.y>-.70&&(Math.abs(receiverX)>.40||p.y>1.03)||
             centralPattern&&b.y>-.82&&p.y>.78)&&(!q?.expectLob||b.y>-.48);
        if(shortApproach||buildApproach&&(!q?.expectLob||b.y>-.48))
          add('approach','deep',open*.73,pace,shortApproach?1.65:1.10,true);
        if(atNet&&attackable)add('volley-finish',p.y>.82?'short':'deep',open*.73,-.10,1.95,true);
      }
      // Prefer the best opportunities without becoming a fixed left/right bot.
      // Modest variation also leaves patterns a human can learn and disrupt.
      const best=Math.max(...candidates.map((c: any)=>c.value));
      for(const c of candidates){
        let preference=c.name==='approach'?netPreference():centralPattern?1:personalityWeight(c.name);
        if(style){
          // Patterns bias the next useful action, not a compulsory sequence. Keep
          // learned central counterplay while retaining each opponent's taste.
          const taste=c.name==='approach'?1:personalityWeight(c.name)**2;
          const construction=tactics.pattern==='all-court'
            ? (c.name==='approach'?2.6:1)
            :tactics.pattern==='change-up'
              ? (c.name==='drop'?1.9:c.name==='change-pace'?2:1)
              : (c.name==='drop'?.65:c.name==='approach'?.60:1);
          preference=(c.name==='approach'?netPreference():taste)*construction;
          if(centralPattern&&c.name==='drop')preference=Math.max(1.35,preference);
        }
        c.weight=Math.exp((c.value-best)*4)*preference;
      }
      let ticket=env.seeded(seed+31)*candidates.reduce((sum: any,c: any)=>sum+c.weight,0);
      for(const c of candidates){ticket-=c.weight;if(ticket<=0)return c;}
      return candidates.at(-1);
    }

  // match-engine.js l.1997
  function proShotPlan(quality: any) {
      if(env.isLegend())return legendShotPlan(quality);
      const b = env.state.ball, p = env.state.player, ai = env.state.ai;
      const tactics = ai.tactics || {pattern: 'all-court', shots: 0};
      const seed = Math.floor(env.state.time * 733) + env.state.rallyHits * 197 + tactics.shots * 89;
      const draw = env.seeded(seed + 31), laneDraw = env.seeded(seed + 127);
      const receiverX = env.clamp(p.x + p.vx * .16, -.95, .95);
      const open = Math.abs(receiverX) > .1 ? -Math.sign(receiverX) : (laneDraw < .5 ? -1 : 1);
      const cross = Math.abs(b.x) > .12 ? -Math.sign(b.x) : open;
      const defending = quality < .30 || b.y < -1.02 || Math.abs(ai.x) > .88 || b.z < .12;
      const attackable = !defending && quality > .40 && b.y > -.92 && b.z > .14;
      const atNet = ai.y > -.46 && b.y > -.55;
      const drive = Math.abs(ai.y) <= PRO_POSITION.deepOutWithin ? 'neutral' : 'deep';
      const contactPressure=proContactPressure(ai,b,quality);
      if(env.isPro()&&(contactPressure>.40||ai.pro?.lobRetreat&&(ai.runningSwing||ai.vy<-.15))){
        // Saving a difficult ball leaves a playable opening. Severe pressure
        // gives a shorter reply; an ordinary retreat can still reset deep.
        return {name:'pressure-reset',shot:contactPressure>.70?'neutral':drive,
          depth:env.lerp(.90,.76,env.clamp((contactPressure-.48)/.40,0,1)),
          x:open*(.46-.10*contactPressure),pace:.06+.12*contactPressure,net:false};
      }
      const candidates: any[] = [];
      const add = (name: any, weight: any, shot: any, x: any, pace: any, net = false) => {
        if(name==='approach')weight*=netPreference();
        else weight*=personalityWeight(name);
        // Variety is chosen once per contact, never rerolled during ball flight.
        if (tactics.last === name) weight *= tactics.repeats >= 2 ? .12 : .5;
        // Near the net, use a controlled drive; an intentional lob keeps its arc.
        candidates.push({name, weight, shot:shot==='deep' && name!=='lob'?drive:shot, x, pace, net});
      };
      if (defending) return {name: 'reset', shot: drive, x: open * .43, pace: .20, net: false};
      const netReply=netReplyPlan(quality);
      if(netReply)return netReply;
      {
        add('crosscourt', tactics.pattern === 'pressure' ? 3 : 1.8, 'deep', cross * .64, .03, atNet);
        add('open-court', Math.abs(receiverX) > .32 ? 3.5 : 1.5, 'deep', open * .74, -.10, atNet);
        add('change-pace', tactics.pattern === 'change-up' ? 2 : .8, 'neutral', open * .55, .12, atNet);
        // Catch a recovering runner behind their momentum; avoid feeding someone
        // who is stationary or already running out toward that side.
        if (Math.abs(p.vx) > .3 && p.x * p.vx < -.04)
          add('wrong-foot', 2.5, 'deep', Math.sign(p.x) * .65, -.08, atNet);
        if (attackable && p.y > .78 && p.vy > -.3 && env.state.rallyHits >= 3)
          add('drop', (tactics.pattern === 'change-up' ? 3.4 : 2) * env.dropShotSuccess(ai),
            'short', open * .56, .02, Math.abs(ai.x) < .7);
        // Approach behind a shorter ball and an exposed receiver, rather than
        // abandoning baseline coverage just because the human is standing deep.
        if (attackable && !atNet && Math.abs(ai.x) < .65 && b.y > -.78 &&
            (p.y > .92 || Math.abs(receiverX) > .35))
          add('approach', tactics.pattern === 'all-court' ? 4 : 2.2, 'deep', open * .68, -.06, true);
      }
      if (atNet && attackable) add('volley-finish', 5, p.y > .7 ? 'short' : 'deep', open * .70, -.08, true);
      let ticket = draw * candidates.reduce((sum: any, candidate: any) => sum + candidate.weight, 0);
      for (const candidate of candidates) {
        ticket -= candidate.weight;
        if (ticket <= 0) return candidate;
      }
      return candidates[candidates.length - 1];
    }

  // match-engine.js l.2056
  function aiServeReturnPlan(quality: any) {
      const b=env.state.ball, p=env.state.player, ai=env.state.ai, cfg=SERVE_RETURN[env.state.difficulty];
      // Judge the ball arriving at the racket, after the serve's bounce. A serve
      // number alone says nothing about its actual pace or how stretched we are.
      const speed=env.physics.speedKph(b);
      const stretch=env.clamp(Math.hypot((b.x-ai.x)*5.018,(b.y-ai.y)*11.885)/env.SERVE.returnReachMetres,0,1);
      const paceLoad=env.clamp((speed-cfg.comfortKph)/55,0,1);
      const extension=env.clamp((stretch-.45)/.55,0,1);
      const low=env.clamp((.22-b.z)/.20,0,1);
      const jam=env.clamp((.22-Math.abs((b.x-ai.x)*5.018))/.22,0,1)*env.clamp((speed-85)/45,0,1);
      const pressure=env.clamp(.28*paceLoad+.38*extension+.18*(1-quality)+.16*low+.08*jam,0,1);
      // A compact swing can attack a manageable serve. Arrival height, spacing
      // and preparation must support it; a second-serve label is not a bonus.
      const attack=env.clamp((cfg.attackKph-speed)/45,0,1)*env.clamp((quality-.55)/.35,0,1)*
        env.clamp((.78-stretch)/.45,0,1)*env.clamp((b.z-.08)/.20,0,1);
      const receiverX=env.clamp(p.x+p.vx*.16,-.95,.95);
      const draw=env.seeded(Math.floor(env.state.time*733));
      const side=Math.abs(receiverX)>.10?-Math.sign(receiverX):(draw>.5?1:-1);
      const deep=attack>.25 && !(env.isPro() && Math.abs(ai.y)<=PRO_POSITION.deepOutWithin);
      // Ordinary pressure reduces angle and ambition while retaining useful
      // depth. Only a genuinely compromised block collapses into a short reply.
      const emergency=env.clamp((pressure-.40)/.60,0,1);
      const depth=deep?env.lerp(.87,.93,attack):cfg.depth-.18*pressure-.44*emergency**1.3;
      const x=side*(cfg.width-.18*pressure+.06*attack);
      // Redirect some incoming pace instead of stretching every block to a
      // fixed groundstroke flight time. The normal solver still clears the net.
      const metres=Math.hypot((x-b.x)*5.018,(depth-b.y)*11.885);
      const pace=cfg.speed+2*env.clamp((speed-80)/60,0,1)+4*attack-6*pressure;
      return {name:deep?'return-attack':pressure>.55?'return-defense':'return-block',shot:deep?'deep':'neutral',
        x,depth,time:metres/pace,clearance:cfg.clearance+.045*pressure,pace:0,net:false,servePressure:pressure};
    }

  // match-engine.js l.2088
  function aiShotPlan(quality: any) {
      // A legal service bounce clears isServe; shotType survives until contact.
      // Keep this separate from rally attacks, without changing human returns.
      if(env.state.ball.shotType==='serve' && env.state.ball.lastHit==='player' && env.state.ball.bounceCount===1)
        return aiServeReturnPlan(quality);
      const plan=aiRallyShotPlan(quality);
      // Recovery intent belongs to the continuing attack, not just a shot name.
      // Defensive lobs/resets and failed contacts still release it normally.
      return env.usesNetTactics() && env.state.ai.tactics?.net
        ? {...plan,net:!!plan.net || canContinueNet(quality,plan)} : plan;
    }

  // match-engine.js l.2100
  function aiRallyShotPlan(quality: any) {
      if (env.isPro()) {
        const b=env.state.ball,ai=env.state.ai,chase=ai.pro?.shortChase;
        const pressure=proContactPressure(ai,b,quality);
        if(b.shotType==='short'&&chase?.pressure>.50&&b.z<.30&&
            (quality<.46||pressure>.52)){
          // An earned, barely reached save floats up. No fixed lob lottery:
          // distance, time, wrong-footing and the actual contact determine it.
          const strain=env.clamp((chase.pressure-.50)*1.30+pressure*.35,0,1);
          const receiverX=env.state.player.x+env.state.player.vx*.18;
          const open=Math.abs(receiverX)>.08?-Math.sign(receiverX):(b.x>=0?-1:1);
          return {name:'recovery-lob',shot:'lob',x:open*env.lerp(.52,.32,strain),
            lobPressure:strain,pace:0,net:false};
        }
        return proShotPlan(quality);
      }
      const b = env.state.ball, p = env.state.player;
      const attacking = b.y > -.88 && b.z > .16 && quality > .38;
      const defending = quality < .30 || b.y < -1.03;
      const draw = env.seeded(Math.floor(env.state.time * 733));
      // Read visible position and momentum, never the human's queued aim.
      const receiverX = env.clamp(p.x + p.vx * .16, -.95, .95);
      const side = Math.abs(receiverX) > .10 ? -Math.sign(receiverX) : (draw > .5 ? 1 : -1);
      const netReply=!defending?netReplyPlan(quality):null;
      if(netReply)return netReply;
      const netPlan=!defending?basicNetPlan(quality,receiverX,side):null;
      if(netPlan)return netPlan;
      const width = env.state.difficulty === 'beginner' ? .48 : env.state.difficulty === 'club' ? .68 : .77;
      // Keep unstyled opponents on the existing
      // path. Basic personalities use the same reads, widths and pace as before;
      // only a clean rally contact offers a choice of construction.
      if(cpuStyle()&&!defending&&b.y>=-.92&&b.z>.12&&Math.abs(env.state.ai.x)<.88)
        return basicPersonalityPlan(quality,side,width,attacking);
      const shot = defending ? 'deep' : chooseAIShot();
      return { shot, x: side * width * (defending ? .55 : attacking ? 1 : .82),
        pace: defending ? .16 : attacking ? (env.state.difficulty === 'beginner' ? -.06 : -.15) : 0 };
    }

  // match-engine.js l.2138
  function basicPersonalityPlan(quality: any,side: any,width: any,attacking: any) {
      const b=env.state.ball,p=env.state.player,t=env.state.ai.tactics;
      const seed=Math.floor(env.state.time*733)+env.state.rallyHits*197+(t?.shots||0)*89;
      const cross=Math.abs(b.x)>.12?-Math.sign(b.x):side;
      const x=width*(attacking?1:.82);
      const pace=attacking?(env.state.difficulty==='beginner'?-.06:-.15):0;
      const canDrop=attacking&&env.state.rallyHits>=4&&p.y>.74&&p.vy>=-.3;
      const candidates: any[]=[];
      const add=(name: any,shot: any,lane: any,weight: any)=>{
        weight*=personalityWeight(name);
        if(t?.last===name)weight*=t.repeats>=2?.12:.5;
        candidates.push({name,shot,x:lane,pace,weight});
      };
      // Crosscourt stays inside the existing ordinary drive width. A point plan
      // affects which rally ball sets up the opening, not its execution envelope.
      add('crosscourt','deep',cross*x*.82,(canDrop?.30:.45)*(t?.pattern==='pressure'?1.15:1));
      add('open-court','deep',side*x,canDrop?.30:.63);
      add('change-pace','neutral',side*x,canDrop?.50:1);
      if(canDrop)add('drop','short',side*x,.90*(t?.pattern==='change-up'?1.15:1));
      let ticket=env.seeded(seed+31)*candidates.reduce((sum: any,c: any)=>sum+c.weight,0);
      for(const c of candidates){ticket-=c.weight;if(ticket<=0)return c;}
      return candidates.at(-1);
    }

  // match-engine.js l.2162
  function serveBalancedContactAhead(player: any,dt: any,quality: any) {
      const read=player.serveRead,step=dt||1/60,age=player.swingAge+step;
      if(!player.runningSwing||!read?.observed||!player.readTarget||!Number.isFinite(player.serveContactAge)||
          age>player.serveContactAge+env.SERVE.returnContactHalfWindow-1e-9)return false;
      // Consider only the next frame of the same committed swing. Use the
      // receiver's uncertain observation, never the true future ball velocity.
      const now=predictObservedServe(read,env.state.time),incoming=predictObservedServe(read,env.state.time+step);
      if(!now?.active||!incoming?.active||incoming.bounceCount!==1||incoming.y>=-.015||incoming.vy>=0||
          incoming.z<.04||incoming.z>env.level().maxHitZ)return false;
      const runner=copyAIRunner(player);moveAI(runner,player.readTarget,step);
      const stroke=env.strokes.select(runner,incoming);
      const extension=.92+.08*env.clamp(1-Math.abs(age-player.serveContactAge)/env.SERVE.returnContactHalfWindow,0,1);
      const reach=env.SERVE.returnReachMetres/5.018*stroke.reachScale*extension;
      const distance=env.racketDistance(runner,incoming);
      const error=Math.hypot((now.x-env.state.ball.x)*5.018,(now.y-env.state.ball.y)*11.885)/5.018;
      const projected=.12+env.clamp(1-distance/reach,0,1)*.62+
        env.clamp(1-Math.abs(age-SERVE_CPU[env.state.difficulty].block)/.17,0,1)*.26;
      // Forecast disagreement consumes the safety margin. If a clearly better,
      // comfortable contact is not available, keep the current emergency pickup.
      return stroke.reachable&&distance<reach*.86&&distance+error+.08/5.018<reach&&projected>quality+.04;
    }

  return { netPreference, cpuStyle, personalityWeight, makeAITactics, serveAnticipation, serveReceiverDepth, planCPUServe, overheadTarget, advanceReturnPrediction, canPrepareAceReturn, moveServeReceiver, moveAI, copyAIRunner, proBalanceLoad, proContactPressure, recordProContact, readProPattern, readLegendPattern, canReachAITarget, aceSwingContact, proBalancedContactAhead, proCanWaitForBalancedReturn, netVolleyTarget, contactTarget, scheduleAIRead, aiRecoveryTarget, updateAI, predictObservedServe, observeServe, updateServeReceiver, observedServeIntercept, chooseAIShot, canContinueNet, basicNetPlan, netReplyPlan, legendShotPlan, proShotPlan, aiServeReturnPlan, aiShotPlan, aiRallyShotPlan, basicPersonalityPlan, serveBalancedContactAhead };
}
export type AiModule = ReturnType<typeof createAiModule>;
