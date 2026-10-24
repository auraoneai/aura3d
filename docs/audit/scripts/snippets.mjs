// Verifies CLI commands, import paths, @aura3d/engine root names and pnpm scripts quoted in entry docs against source.
// Run from the repo root: node docs/audit/scripts/snippets.mjs  (writes a temp JSON next to it; delete after reading)
import fs from "node:fs";
import {execSync} from "node:child_process";
const root=JSON.parse(fs.readFileSync("package.json","utf8"));
const subpaths=new Set(Object.keys(root.exports).map(k=>"@aura3d/engine"+k.slice(1)));
const pkgNames=new Set();
for(const d of fs.readdirSync("packages")){const f=`packages/${d}/package.json`;if(fs.existsSync(f)){const p=JSON.parse(fs.readFileSync(f,"utf8"));pkgNames.add(p.name);
 for(const k of Object.keys(p.exports||{}))subpaths.add(p.name+k.slice(1));}}
pkgNames.add("@aura3d/engine");
// root exports
const idx=fs.readFileSync("packages/engine/src/public/index.ts","utf8");
const live=new Set(), dep=new Set();
let isDep=false;
for(const line of idx.split("\n")){
  if(/^\/\*\* @deprecated/.test(line)||/Deprecated union/.test(line)) isDep=true;
  const m=line.match(/^export (?:type )?\{([^}]*)\}/);
  if(m){for(const n of m[1].split(",")){const nm=n.trim().split(/\s+as\s+/).pop();if(nm)(isDep?dep:live).add(nm);} if(!/@deprecated/.test(lines_prev))isDep=isDep;}
  var lines_prev=line;
}
const rootNames=new Set([...live,...dep]);
const cli=new Set(["assets add","assets admit","assets import-meshy","assets optimize","assets merge-clips","assets scan","assets inspect","assets validate","assets validate-game","assets validate-animation-studio","assets validate-animation","assets assemble-character","assets list","assets typegen","assets bind-game-route-evidence","assets certify-game-geometry","assets thumbnail","assets search","assets resolve","assets review","assets lookdev","assets library","assets prune","assets bake-impostor","assets serve","meshy ledger","animation plan","animation preview","animation render","animation package","animation review","animation verify","animation scene","animation inspect-clips","animation validate-hero","doctor","check-deploy","init","codemod","migrate three","migrate lighting","vfx validate-atlas","core inspect-programs","core-v2","environments bake","sfx admit","look capture","look judge","look rubric","look lint","perf gate"]);
const cliTop=new Set([...cli].map(c=>c.split(" ")[0]));
const scripts=new Set(Object.keys(root.scripts||{}));
const anyScripts=new Set();
for(const f of execSync("git ls-files '**/package.json'",{encoding:"utf8"}).trim().split("\n")){try{for(const k of Object.keys(JSON.parse(fs.readFileSync(f,"utf8")).scripts||{}))anyScripts.add(k)}catch{}}
const files=execSync("git ls-files '*.md' 'llms.txt'",{encoding:"utf8"}).trim().split("\n").filter(p=>/^(README\.md|llms\.txt|docs\/(agents|concepts|migration|comparisons|examples|api|index\.md|workflows)|packages\/aura3d-cli\/skills|packages\/create-aura3d\/README|templates\/[^/]+\/(AGENTS|README)|packages\/[^/]+\/README)/.test(p));
const results=[]; // {file,kind,snippet,ok,why}
for(const f of files){
  const src=fs.readFileSync(f,"utf8");
  const blocks=[...src.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(m=>m[1]).concat([...src.matchAll(/`([^`\n]+)`/g)].map(m=>m[1]));
  for(const b of blocks){
    for(const line of b.split("\n")){
      for(const m of line.matchAll(/(?:^|[\s$>(])(?:npx |pnpm exec |pnpm dlx |npm exec )?aura3d\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g)){
        const two=m[2]?`${m[1]} ${m[2]}`:m[1];
        const ok=cli.has(two)||(cliTop.has(m[1])&&!m[2])||(m[2]===undefined&&cli.has(m[1]))||([...cli].some(c=>c.startsWith(m[1]+" "))&&(!m[2]||!/^[a-z]/.test(m[2])||false));
        let okv=cli.has(two)||cli.has(m[1]);
        if(!okv && ["assets","animation","meshy","migrate","core","environments","sfx","vfx"].includes(m[1]) && !m[2]) okv=true;
        results.push({file:f,kind:"cli",snippet:`aura3d ${two}`,ok:okv});
      }
      for(const m of line.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](@aura3d\/[a-z0-9-]+(?:\/[A-Za-z0-9/._-]+)?|create-aura3d)["']/g)){
        const spec=m[2];const base=spec.split("/").slice(0,2).join("/");
        const okpkg=pkgNames.has(base)||spec==="create-aura3d";
        const oksub=spec===base?okpkg:(subpaths.has(spec)||subpaths.has(spec.replace(/\.js$/,"")));
        results.push({file:f,kind:"import-path",snippet:spec,ok:okpkg&&oksub});
        if(spec==="@aura3d/engine"&&m[1]){for(const n of m[1].split(",")){const nm=n.trim().replace(/^type\s+/,"").split(/\s+as\s+/)[0];if(nm)results.push({file:f,kind:"engine-root-name",snippet:nm,ok:rootNames.has(nm),dep:dep.has(nm)});}}
      }
      for(const m of line.matchAll(/(?:pnpm|npm run)\s+(?:run\s+)?([a-z][a-z0-9:_-]*)/g)){ if(["install","add","exec","dlx","i","create","test","build","init","publish","pack","ci","view","dev","start"].includes(m[1]))continue; results.push({file:f,kind:"script",snippet:m[1],ok:scripts.has(m[1])});}
    }
  }
}
fs.writeFileSync("docs/audit/.snippets.tmp.json",JSON.stringify(results));
const uniq=new Map();for(const r of results){const k=r.kind+"|"+r.snippet;const e=uniq.get(k)||{...r,files:new Set()};e.files.add(r.file);uniq.set(k,e);}
const arr=[...uniq.values()];
const by=k=>arr.filter(r=>r.kind===k);
for(const k of ["cli","import-path","engine-root-name","script"]){const a=by(k);console.log(k,"unique",a.length,"bad",a.filter(r=>!r.ok).length,"occurrences",results.filter(r=>r.kind===k).length)}
console.log("--- BAD (script rows: [exists elsewhere] = only in a template or app package.json, not the root)");
for(const r of arr.filter(r=>!r.ok))console.log(r.kind,"|",r.snippet,r.kind==="script"&&anyScripts.has(r.snippet)?"[exists elsewhere]":"","|",[...r.files].slice(0,3).join(", "),[...r.files].length>3?`(+${[...r.files].length-3})`:"");
console.log("--- deprecated names used:",arr.filter(r=>r.dep).map(r=>r.snippet).join(", "));
console.log("rootNames",rootNames.size,"live",live.size,"dep",dep.size);
