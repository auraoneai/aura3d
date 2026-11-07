import json,sys
W="/tmp/b505-animation-work3"
runs=[]
for b,pre in (("bench505-animation","B"),("bench505-animation-sheet","S")):
    p=json.load(open(f"{W}/{b}/ports.json"))
    for rid,port in p.items():
        rest=rid[len(b)+1:]  # t10-aura-r1
        t,arm,r=rest.split("-")
        code=f"{pre}{t[1:]}{arm[0]}{r[1:]}"
        runs.append((code,rid,port,b))
json.dump({c:{"runId":rid,"batch":b,"port":p} for c,rid,p,b in runs},open("/tmp/b505-codes.json","w"),indent=1)
g=int(sys.argv[1]); size=9
sel=runs[g*size:(g+1)*size]
acts=[]
for c,rid,port,b in sel:
    acts.append({"action":"goto","step_id":f"{c}-g","destination":{"url":f"http://127.0.0.1:{port}/"},"wait_until":"load"})
    acts.append({"action":"wait_for_timeout","step_id":f"{c}-1","duration_ms":1500})
    for k in range(2,7): acts.append({"action":"wait_for_timeout","step_id":f"{c}-m{k}","duration_ms":250})
    acts.append({"action":"wait_for_timeout","step_id":f"{c}-2","duration_ms":1500})
print(json.dumps({"browser":{"mode":"launch","executable_path":"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"},"start_url":{"url":f"http://127.0.0.1:{sel[0][2]}/"},"environment":{"viewport":{"width":640,"height":360,"device_scale_factor":1},"reduced_motion":"no-preference"},"actions":acts,"capture":{"after_each_step":["screenshot"],"events":["console","page-errors"]}},separators=(',',':')))
