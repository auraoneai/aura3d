/* Aura3D Animation Studio — sample project: "Two Robots Argue on a Space Station" */
window.STUDIO = (function () {
  const FRAME = {
    wide: 'assets/wide.png',
    open: 'assets/open.png',
    close: 'assets/close.png',
  };

  const cast = [
    { id: 'miko', name: 'Miko', kind: 'Robot · lead', color: '#ff8a5b', glyph: 'M', lines: 6 },
    { id: 'luma', name: 'Luma', kind: 'Robot · lead', color: '#4fc2ff', glyph: 'L', lines: 5 },
    { id: 'pip',  name: 'Pip',  kind: 'Drone · extra', color: '#9a7bff', glyph: 'P', lines: 0 },
  ];

  const sets = [
    { id: 'ext-station', name: 'Station — Exterior', meta: 'HDR · dusk', icon: 'globe' },
    { id: 'obs-deck',    name: 'Observation Deck',   meta: 'interior', icon: 'frame' },
  ];

  const props = [
    { id: 'planet',  name: 'Ringed Planet', meta: 'backdrop', icon: 'planet' },
    { id: 'console-p',name: 'Holo Console',  meta: 'animated', icon: 'cube' },
    { id: 'crystal', name: 'Energy Cell',   meta: 'emissive', icon: 'spark' },
  ];

  // shots laid on a ~70s timeline
  const shots = [
    { id: 'shot-1', name: 'Establishing', start: 0,  dur: 14, frame: FRAME.open,  cam: 'wide · 24mm', who: ['miko','luma'], color: '#5b6bd6' },
    { id: 'shot-2', name: 'Two-shot',     start: 14, dur: 26, frame: FRAME.wide,  cam: 'medium · 35mm', who: ['miko','luma'], color: '#6b6bff' },
    { id: 'shot-3', name: 'Luma — CU',    start: 40, dur: 18, frame: FRAME.close, cam: 'close · 50mm', who: ['luma'], color: '#4f8fd6' },
    { id: 'shot-4', name: 'Reverse',      start: 58, dur: 12, frame: FRAME.wide,  cam: 'over-shoulder', who: ['miko'], color: '#7b6bd6' },
  ];

  const beats = [
    { id:'b1', shot:'shot-1', who:'miko', start:2,  dur:9,  text:'draft line; refine for: two robots argue on a space station' },
    { id:'b2', shot:'shot-2', who:'luma', start:16, dur:10, text:'you re-routed the coolant AGAIN' },
    { id:'b3', shot:'shot-2', who:'miko', start:28, dur:9,  text:'it was venting plasma onto the deck!' },
    { id:'b4', shot:'shot-3', who:'luma', start:42, dur:14, text:'draft response' },
    { id:'b5', shot:'shot-4', who:'miko', start:59, dur:9,  text:'…fine. we reroute it together.' },
  ];

  const camera = [
    { id:'c1', start:0,  dur:14, text:'push-in' , color:'#2dd4a7'},
    { id:'c2', start:40, dur:18, text:'slow orbit', color:'#2dd4a7' },
  ];
  const fx = [
    { id:'f1', start:6,  dur:6,  text:'plasma vent', color:'#ff6f4d' },
    { id:'f2', start:44, dur:8,  text:'rim light', color:'#ffb020' },
  ];

  const DUR = 70; // seconds

  // seed transcript of the director loop
  const seed = [
    { type:'you', text:'Two robots argue on a space station at dusk — keep it snappy, ~70 seconds, four shots.' },
    { type:'dir', think:'Spinning up a new scene on the **Station — Exterior** set with a ringed-planet backdrop. I\'ll cast two robot leads and block four shots.' },
    { type:'cmd', verb:'set', args:'station --hdr dusk --backdrop "ringed planet"', state:'ok',
      diffs:[{op:'+',k:'add',t:'set <b>Station — Exterior</b> committed'},{op:'+',k:'add',t:'prop <b>Ringed Planet</b> linked'}], dur:'820ms' },
    { type:'cmd', verb:'cast', args:'add robot --query "robot" --name Miko --name Luma', state:'ok',
      diffs:[{op:'+',k:'add',t:'cast <b>Miko</b> (lead)'},{op:'+',k:'add',t:'cast <b>Luma</b> (lead)'}], dur:'1.4s' },
    { type:'dir', think:'Blocking the sequence. Beat 1 opens on a two-shot; I drafted Miko\'s first line as a placeholder for you to refine.' },
    { type:'cmd', verb:'shot', args:'block --count 4 --pattern establish,two-shot,cu,reverse', state:'ok',
      diffs:[{op:'+',k:'add',t:'4 shots blocked · <b>70s</b> total'},{op:'~',k:'mod',t:'beat <b>Miko · b1</b> drafted'}], dur:'2.1s' },
    { type:'render', frame:FRAME.wide, label:'low-fi preview · 1:10', shot:'Full sequence', meta:'rendered 2m ago' },
  ];

  return { cast, sets, props, shots, beats, camera, fx, DUR, FRAME, seed };
})();
