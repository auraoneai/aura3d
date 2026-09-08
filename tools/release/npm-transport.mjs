/** pnpm may populate lowercase npm_config_proxy with an empty value. Explicit
 * npm CLI transport keeps the authorized runner proxy selected deterministically. */
export function withNpmTransport(args,environment=process.env) {
 if(!['install','i','ci','view','ping','audit','publish'].includes(args[0]))return [...args];
 if(args.some(a=>/^--(?:https-)?proxy(?:=|$)/.test(a)))return [...args];
 const configured=['A3D_NPM_PROXY','HTTPS_PROXY','https_proxy','npm_config_https_proxy','npm_config_proxy','HTTP_PROXY','http_proxy'].map(k=>environment[k]?.trim()).find(Boolean);
 if(!configured)return [...args];
 const proxy=new URL(configured);
 if(!['https:','http:'].includes(proxy.protocol)||proxy.username||proxy.password)throw new Error('Npm CLI proxy must be an authorized HTTP(S) endpoint without embedded credentials');
 return [args[0],`--proxy=${proxy.href}`,`--https-proxy=${proxy.href}`,...args.slice(1)];
}
