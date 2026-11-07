import base64,json,os,re,sys
src=sys.argv[1]; REPO=open('/tmp/b505-animation.path').read().strip()
codes=json.load(open('/tmp/b505-codes.json'))
d=json.load(open(src))["normalized_result"]
out=os.path.join(REPO,"evidence/agent-eval-505/animation/frames"); os.makedirs(out,exist_ok=True)
n=0; errs={}
for s in d["steps"]:
    sid=s.get("step_id") or ""
    m=re.match(r"^([A-Z]\d+[at]\d)-(g|1|2|m\d)$",sid)
    if not m: continue
    code,k=m.groups(); rid=codes[code]["runId"]
    v=((s.get("artifacts") or {}).get("screenshot") or {}).get("value") or {}
    if v.get("data_base64") and k!="g":
        open(os.path.join(out,f"{rid}-{k}.png"),"wb").write(base64.b64decode(v["data_base64"])); n+=1
    if s["status"]!="completed": print("step issue",sid,s["status"],s.get("error"))
cur=None
step_run={}
for s in d["steps"]:
    m=re.match(r"^([A-Z]\d+[at]\d)-",s.get("step_id") or "")
    if m: cur=m.group(1)
    step_run[s["step_index"]]=cur
for e in d["events"]["items"]:
    c=step_run.get(e["step_index"])
    if c and e["kind"] in("console","page-errors") and (e.get("level")=="error" or e["kind"]=="page-errors") and "favicon" not in json.dumps(e):
        errs.setdefault(codes[c]["runId"],[]).append(e.get("text") or json.dumps(e)[:200])
print(n,"frames; dropped events",d["events"]["dropped"])
ef=os.path.join(REPO,"evidence/agent-eval-505/animation/console-errors.json")
cur=json.load(open(ef)) if os.path.exists(ef) else {}
cur.update(errs); json.dump(cur,open(ef,"w"),indent=1); print(errs)
