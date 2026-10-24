/* Pure articulated animation; this never changes gameplay position or input. */
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.TennisPose=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  const TAU=Math.PI*2;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  function knee(hip,foot){
    const delta=foot.map((v,i)=>v-hip[i]);
    const d=Math.max(.001,Math.hypot(...delta));
    const dir=delta.map(v=>v/d);
    const forward=[0,0,-1],dot=dir[2]*-1;
    const bend=forward.map((v,i)=>v-dir[i]*dot);
    const length=Math.hypot(...bend)||1;
    const height=Math.sqrt(Math.max(.001,.48**2-(Math.min(.95,d)/2)**2));
    return hip.map((v,i)=>v+delta[i]*.5+bend[i]/length*height);
  }
  function pose(player,state){
    const serve=state.serveAttempt?.server===player.side?state.serveAttempt:null;
    const serveWindup=state.phase==='serveToss'&&serve?.swingAt!=null;
    const serveAge=serveWindup?Math.max(0,state.time-serve.swingAt):0;
    const serveProgress=serveWindup?clamp(serveAge/Math.max(.001,serve.contactAt-serve.swingAt),0,1):0;
    const move=clamp(player.moveBlend,0,1),phase=player.stride;
    const face=player.side==='player'?1:-1;
    const speed=Math.hypot(player.vx*5.5,player.vy*8);
    const dx=speed>.01?player.vx*5.5/speed*face:0;
    const dz=speed>.01?player.vy*8/speed*face:-1;
    const split=player.splitStep>0?Math.sin(clamp(1-player.splitStep/.22,0,1)*Math.PI):0;
    const hitAge=player.strokeContactAge||.17;
    const wind=smooth(player.swingAge/hitAge);
    const follow=player.strokeConnected?smooth((player.swingAge-hitAge)/Math.max(.08,.33-hitAge)):0;
    // A connected stroke settles back into the ready grip before its timer
    // expires. Late contacts retain their full reach through the strike.
    const settle=player.swing>0 && player.strokeConnected
      ?smooth(1-player.swing/.065)*smooth((player.swingAge-hitAge)/.055):0;
    const plantedStroke=player.swing>0 && move<.2 && player.stroke!=='serve';
    const coil=plantedStroke?Math.sin(wind*Math.PI)*(1-follow):0;
    const slide=player.slideRemaining>0?(player.slidePoseStatic?1:smooth((.32-player.slideRemaining)/.055)*smooth(player.slideRemaining/.065)):0;
    const hipY=.887-.025*move+Math.cos(phase*2)*.018*move*(1-slide)-.040*split-.028*coil-.22*slide;
    const legs=[-1,1].map((side,i)=>{
      const t=((phase/TAU+i*.5)%1+1)%1;
      const stance=t<.58;
      const swing=clamp((t-.58)/.42,0,1);
      const along=stance?mix(.46,-.46,t/.58):mix(-.46,.46,swing*swing*(3-2*swing));
      // Side shuffles stay low; a forward run has more knee drive. The
      // stance foot travels back at a constant rate until toe-off.
      const lift=stance?0:Math.sin(swing*Math.PI)*mix(.17,.23,Math.abs(dz))*move;
      const hip=[side*.15,hipY,0];
      // Lateral footwork is a shuffle, not a forward stride rotated sideways:
      // keep the feet on their own side instead of crossing through each other.
      const foot=[side*(.25+.035*split)+dx*along*move*.40,.09+lift,dz*along*move+.025+side*.025*(1-move)];
      if(plantedStroke){
        // A small split stance and weight transfer, with no root translation.
        const turn=player.stroke==='backhand'?-1:1;
        foot[2]+=side*turn*.075*Math.sin(wind*Math.PI)*(1-follow);
      }
      if(slide){
        const leading=side===(dx<0?-1:1);
        const reach=leading?.63:-.38;
        const target=[side*.24+dx*reach,.075,dz*reach+.025];
        for(let axis=0;axis<3;axis++)foot[axis]=mix(foot[axis],target[axis],slide);
      }
      return {hip,knee:knee(hip,foot),foot,planted:slide>0||stance||move<.04};
    });
    const bodyBob=hipY-.91;
    let right=[.15,1.05+bodyBob,-.35],left=[.075,1.16+bodyBob,-.37];
    const breath=Math.sin((state.time||0)*2.2)*.003*(1-move);
    right[1]+=breath;left[1]+=breath;
    let racketDirection=[-.1,.82,-.2],torsoYaw=dx*.085*move+Math.sin(phase)*.055*move*Math.abs(dz),strokeLean=0;
    let mode=move>.55?'run':move>.08?'shuffle':'ready';
    const pumping=clamp((move-.28)/.72,0,1);
    right=blend(right,[.28,1.05+Math.cos(phase)*.08,-.23-Math.sin(phase)*.13],pumping*.8);
    left=blend(left,[-.32,1.05-Math.cos(phase)*.10,-.08+Math.sin(phase)*.28],pumping);
    const readyRight=right.slice(),readyLeft=left.slice(),readyRacket=racketDirection.slice(),readyYaw=torsoYaw;
    // Reach from the original low stance with the unchanged arm and racket. The
    // model supplies a root-local point; undo the torso pivot so contact stays
    // on the strings when the shoulders turn, with no stretched limbs.
    const serveReach=()=>{
      if(!player.serveContactPoint)return {hand:[.19,1.96,-.08],direction:[.02,1,-.12]};
      let [x,y,z]=player.serveContactPoint;y-=hipY;
      const rx=-.035+clamp(player.vy*face*.055,-.065,.075)+strokeLean;
      const rz=-clamp(player.vx*face*.09,-.11,.11);
      [y,z]=[Math.cos(rx)*y+Math.sin(rx)*z,-Math.sin(rx)*y+Math.cos(rx)*z];
      [x,z]=[Math.cos(torsoYaw)*x-Math.sin(torsoYaw)*z,Math.sin(torsoYaw)*x+Math.cos(torsoYaw)*z];
      [x,y]=[Math.cos(rz)*x+Math.sin(rz)*y,-Math.sin(rz)*x+Math.cos(rz)*y];
      const shoulder=[.225,1.39+bodyBob,0],delta=[x-shoulder[0],y+hipY-shoulder[1],z];
      const length=Math.hypot(...delta),direction=delta.map(v=>v/length);
      const armReach=Math.min(.578,Math.max(.12,length-.46));
      return {hand:shoulder.map((v,i)=>v+direction[i]*armReach),direction};
    };
    if(serveWindup){
      mode='serve-windup';
      const drive=smooth(serveProgress);
      torsoYaw=mix(-.23,.30,drive);strokeLean=mix(-.025,0,drive);
      const contact=serveReach();
      right=blend([.35,1.2,.24],contact.hand,drive);
      left=blend([-.13,1.88,-.19],[-.3,1.30,-.2],drive);
      racketDirection=blend([.15,.7,.42],contact.direction,drive);
    }else if(state.phase==='serveToss' && state.server===player.side){
      mode='toss';right=[.35,1.2,.24];left=[-.13,1.88,-.19];racketDirection=[.15,.7,.42];
      torsoYaw=-.23;strokeLean=-.025;
    }else if(player.serveMotion>0){
      mode='serve';const p=clamp(1-player.serveMotion/.42,0,1);
      const drive=smooth(p/.72),recover=smooth((p-.72)/.28);
      torsoYaw=mix(.30-.72*drive,readyYaw,recover);strokeLean=.09*Math.sin(p*Math.PI);
      const contact=serveReach();
      right=blend(blend(contact.hand,[-.16,1.06,-.36],drive),readyRight,recover);
      left=blend(blend([-.3,1.30,-.2],[-.34,1.05,.04],drive),readyLeft,recover);
      racketDirection=blend(blend(contact.direction,[-.25,-.48,-.50],drive),readyRacket,recover);
    }else if(player.swing>0){
      mode=player.stroke;
      // Ready → loaded racket → contact → follow-through. Contact stays high
      // on overheads instead of dropping the arm before the ball is struck.
      const path=(ready,loaded,contact,finish)=>follow>0?blend(contact,finish,follow)
        :wind<.5?blend(ready,loaded,smooth(wind*2)):blend(loaded,contact,smooth((wind-.5)*2));
      const height=clamp((player.strokeContactZ??.5)*2.177-.23,.78,1.46);
      if(mode==='smash'){
        const overheadWrist=clamp((player.strokeContactZ??1.08)*2.177-.43,1.44,1.96);
        right=path(right,[.33,1.65,.22],[.24,overheadWrist,-.08],[-.18,1.10,-.34]);
        left=path(left,[-.18,1.88,-.18],[-.25,1.48,-.3],[-.4,1.08,-.08]);
        racketDirection=path(racketDirection,[.12,.55,.65],[.02,1,-.13],[-.4,-.45,-.5]);
        torsoYaw=path([0],[-.6],[-.10],[.50])[0];
        strokeLean=path([0],[-.09],[.02],[.12])[0];
      }else if(mode.endsWith('-volley')){
        const back=mode==='backhand-volley',side=back?-1:1;
        right=path(right,[back?-.12:.38,height+.03,-.14],[back?-.20:.43,height,-.32],[back?-.14:.34,height-.06,-.43]);
        left=path(left,[-.25,1.24,-.18],[-.40,1.22,.02],[-.36,1.13,.06]);
        racketDirection=path(racketDirection,[side*.65,.75,.02],[side*.65,.7,-.12],[side*.55,.65,-.2]);
        torsoYaw=path([0],[-side*.25],[-side*.10],[side*.08])[0];
        strokeLean=.045*wind;
      }else if(mode==='backhand'){
        right=path(right,[-.24,1.13,.12],[-.24,height,-.29],[.33,1.38,-.22]);
        racketDirection=path(racketDirection,[-.78,.34,.38],[-.80,.32,-.32],[.62,.63,-.24]);
        left=right.map((v,i)=>v+[-.075,.05,.055][i]);
        torsoYaw=path([0],[.62],[.14],[-.50])[0];
      }else{
        right=path(right,[.56,1.05,.16],[.52,height,-.30],[-.12,1.40,-.29]);
        left=path(left,[-.28,1.23,-.30],[-.36,1.15,.02],[-.28,1.07,.08]);
        racketDirection=path(racketDirection,[.7,.4,.34],[.75,.25,-.45],[-.55,.62,-.22]);
        torsoYaw=path([0],[-.55],[-.12],[.48])[0];
      }
      right=blend(right,readyRight,settle);left=blend(left,readyLeft,settle);
      racketDirection=blend(racketDirection,readyRacket,settle);
      torsoYaw=mix(torsoYaw,readyYaw,settle);strokeLean*=1-settle;
    }
    // Keep the wrists within human arm reach even on cross-body follow-throughs.
    const reach=(hand,side)=>{
      const shoulder=[side*.225,1.39+bodyBob,0],delta=hand.map((v,i)=>v-shoulder[i]);
      const scale=Math.min(1,.578/Math.max(.001,Math.hypot(...delta)));
      return shoulder.map((v,i)=>v+delta[i]*scale);
    };
    right=reach(right,1);
    if(mode==='backhand'){
      const grip=blend([-.075,.05,.055],readyLeft.map((v,i)=>v-readyRight[i]),settle);
      // Project the shared grip into both arms' reachable space, keeping the
      // hands together instead of stretching an arm or letting go mid-stroke.
      for(let i=0;i<16;i++){
        const second=reach(right.map((v,j)=>v+grip[j]),-1);
        right=reach(second.map((v,j)=>v-grip[j]),1);
      }
      left=right.map((v,j)=>v+grip[j]);
    }else left=reach(left,-1);
    return {mode:slide>0?'slide':mode,sliding:slide>0,legs,right,left,racketDirection,hipY,torsoYaw,
      shoulderY:1.39+bodyBob,headY:1.66+bodyBob+breath,
      leanX:-.035+clamp(player.vy*face*.055,-.065,.075)+strokeLean,leanZ:-clamp(player.vx*face*.09,-.11,.11)};
  }
  return {pose};
});
