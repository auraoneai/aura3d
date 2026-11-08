import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const { pairs, members } = JSON.parse(readFileSync("/tmp/n7names/pairs.json", "utf8"));
const out = [`import * as A from "@aura3d/engine";`, `type AllKeys<T> = T extends unknown ? keyof T : never;`,
 `type Chk<P, K extends string> = [P] extends [never] ? "noparam" : unknown extends P ? "loose" : string extends AllKeys<NonNullable<P>> ? "loose" : K extends AllKeys<NonNullable<P>> ? "yes" : "no";`];
const rows = [];
pairs.forEach((p, i) => {
  const m = /^(.*)#(\d+)\.(.*)$/.exec(p.k); if (!m) return;
  let [, callee, idx, key] = m; if (!/^[A-Za-z_$][\w$]*$/.test(key)) return;
  let ref;
  if (callee.startsWith("handle.")) ref = `Parameters<NonNullable<A.AuraRuntimeNodeHandle["${callee.slice(7)}"]>>[${idx}]`;
  else if (callee.startsWith("app.")) return;
  else ref = `Parameters<typeof A.${callee}>[${idx}]`;
  out.push(`export type R${i} = Chk<${ref}, "${key}">;`); rows.push({ i, k: p.k, runs: p.runs, occ: p.occ });
});
members.forEach((p, i) => {
  const parts = p.k.split(".");
  if (parts.length === 2) out.push(`export type M${i} = "${parts[1]}" extends AllKeys<A.AuraApp> ? "yes" : "no";`);
  else out.push(`export type M${i} = "${parts[2]}" extends AllKeys<NonNullable<A.AuraApp["${parts[1]}" & keyof A.AuraApp]>> ? "yes" : "no";`);
});
mkdirSync("/Users/gurbakshchahal/platforms/aura3d-u-n7-names/.n7tmp", { recursive: true });
writeFileSync("/Users/gurbakshchahal/platforms/aura3d-u-n7-names/.n7tmp/check.ts", out.join("\n"));
writeFileSync("/tmp/n7names/rows.json", JSON.stringify({ rows, members }));
console.log(rows.length, members.length);
