import json,sys
r=json.load(open(sys.argv[1]))
for g in r['games']:
  run=g['runs'][0]; pe=run.get('pageErrors') or []
  bt=(run['shots'][-1]['state'].get('bodyText') or '') if run['shots'] else ''
  print(g['id'], run['url'].split('?')[-1], [e.splitlines()[0][:100] for e in pe][:1], ('ERRPANEL '+bt[:90]) if 'renderer error' in bt else '')
