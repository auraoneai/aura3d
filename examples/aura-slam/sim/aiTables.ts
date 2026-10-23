/* Tables transcribed verbatim from public/toptennis/match-engine.js (SERVE_CPU l.17, PRO_POSITION l.29, SERVE_RETURN l.30, CPU_STYLES l.57). */
export const SERVE_CPU: Readonly<Record<string, any>>=Object.freeze({
  beginner:{runSpeedMetres:5.9,reaction:[.08,.14],observe:.10,error:.30,bias:0,history:0,block:.14,returnSD:.024,returnPitch:6,pace:.85,power:.10,margin:[.45,.70],secondMargin:1,firstSD:.095,secondSD:.065},
  club:{runSpeedMetres:6.1,reaction:[.08,.135],observe:.08,error:.20,bias:.15,history:0,block:.12,returnSD:.023,returnPitch:3,pace:.92,power:.25,margin:[.35,.60],secondMargin:.9,firstSD:.085,secondSD:.060},
  ace:{runSpeedMetres:6.3,reaction:[.075,.125],observe:.06,error:.12,bias:.30,history:4,block:.10,returnSD:.022,returnPitch:1.2,pace:.95,power:.45,margin:[.20,.45],secondMargin:.8,firstSD:.070,secondSD:.056},
  pro:{runSpeedMetres:6.3,reaction:[.075,.125],observe:.06,error:.12,bias:.30,history:4,block:.10,returnSD:.022,returnPitch:1.2,pace:.95,power:.45,margin:[.20,.45],secondMargin:.8,firstSD:.070,secondSD:.056},
  legend:{runSpeedMetres:6.4,reaction:[.07,.115],observe:.04,error:.08,bias:.45,history:10,block:.08,returnSD:.020,returnPitch:1.1,pace:.97,power:.60,margin:[.15,.40],secondMargin:.75,firstSD:.060,secondSD:.056}
});
export const PRO_POSITION: Readonly<Record<string, number>>=Object.freeze({deepOutWithin:.40,longTarget:1.10});
export const SERVE_RETURN: Readonly<Record<string, any>>={
  beginner:{width:.28,depth:.79,speed:16.5,clearance:.11,comfortKph:90,attackKph:105},
  club:{width:.34,depth:.82,speed:18.5,clearance:.095,comfortKph:100,attackKph:115},
  ace:{width:.43,depth:.85,speed:20,clearance:.085,comfortKph:108,attackKph:122},
  pro:{width:.46,depth:.86,speed:20.5,clearance:.08,comfortKph:110,attackKph:125},
  legend:{width:.50,depth:.89,speed:22,clearance:.075,comfortKph:115,attackKph:130}
};
export const CPU_STYLES: Readonly<Record<string, any>>=Object.freeze(Object.fromEntries(Object.entries({
  'baseline-pressure':{patterns:[.65,.85],crosscourt:1.10,'open-court':1.32,'wrong-foot':1.15,'change-pace':.82,drop:.62},
  'net-attacker':{patterns:[.20,.90],crosscourt:.82,'open-court':1.04,'change-pace':.90,drop:.60,'volley-finish':1.4},
  counterpuncher:{patterns:[.70,.85],crosscourt:1.60,'open-court':.72,'wrong-foot':.85,'change-pace':1.06,drop:.55},
  'all-court':{patterns:[.25,.65],crosscourt:.90,'open-court':.92,'change-pace':1.20,drop:1.10,'volley-finish':1.10}
}).map(([name,values])=>[name,Object.freeze({...values,patterns:Object.freeze(values.patterns)})])));
