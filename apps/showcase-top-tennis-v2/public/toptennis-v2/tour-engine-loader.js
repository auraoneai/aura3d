/* Keep active saves playable after an engine update. Version bundles are immutable. */
(() => {
  'use strict';
  const versions = new Map([[window.TennisTourCatalog.engineVersion,Promise.resolve(window.TennisEngine)]]);
  async function load(version) {
    if(!/^tour-[a-zA-Z0-9-]{1,40}$/.test(version))throw new Error('This saved game version is unavailable.');
    if(versions.has(version))return versions.get(version);
    const loading=(async()=>{
      const response=await fetch('/engine-versions/manifest.json',{cache:'no-cache'});
      if(!response.ok)throw new Error('Could not load the saved game version. Please retry.');
      const manifest=await response.json();
      if(!manifest.versions.includes(version))throw new Error('This saved game version is temporarily unavailable. Your tournament is still saved.');
      return new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=`/engine-versions/${version}.js`;
        script.onload=()=>{const bundle=window.TennisTourEngineVersion;if(bundle?.version===version&&bundle.engine?.create)resolve(bundle.engine);else reject(new Error('The saved game version could not be loaded.'));};
        script.onerror=()=>reject(new Error('Could not load the saved game version. Please retry.'));
        document.head.appendChild(script);
      });
    })();
    versions.set(version,loading);
    try{return await loading;}catch(error){versions.delete(version);throw error;}
  }
  window.TennisTourEngines=Object.freeze({load});
})();
