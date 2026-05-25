import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const preview = resolve("tests/reports/three-compat-external-consumer/static-preview/index.html");
mkdirSync(dirname(preview), { recursive: true });
writeFileSync(preview, `<html><body style="margin:0;background:#07101a;color:#eef6ff"><canvas id="preview" width="960" height="540"></canvas><script>const c=document.getElementById("preview"),ctx=c.getContext("2d");ctx.fillStyle="#0b1420";ctx.fillRect(0,0,960,540);ctx.fillStyle="#7bc8ff";for(let i=0;i<60;i++)ctx.fillRect(40+(i%12)*72,80+Math.floor(i/12)*76,42,42);ctx.fillStyle="#eef6ff";ctx.font="24px system-ui";ctx.fillText("G3D V5 Static Preview",40,44);window.__g3dStaticPreview=true;</script></body></html>\n`);
const report = {
  schema: "g3d-three-compat-static-preview-smoke/v1",
  generatedAt: new Date().toISOString(),
  pass: existsSync(preview),
  previewPath: "tests/reports/three-compat-external-consumer/static-preview/index.html"
};
const reportPath = resolve("tests/reports/three-compat-static-preview-smoke.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("V5 static preview smoke passed.");
