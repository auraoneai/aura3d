#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { loadValidatedReleasePlan } from './exact-release-plan.mjs';
const root=process.cwd(),option=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1]},plan=loadValidatedReleasePlan(root,option('--release-plan')??process.env.A3D_RELEASE_PLAN);
if(!plan)throw new Error('Exact release plan required');
const path=resolve(root,option('--output')??'marketing/dist/release-source.json');
if(!path.split('/').includes('dist'))throw new Error('Marker must be generated into build output, never source');
mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({schema:'aura3d-release-source/v1',version:plan.version,source:plan.source,releasePlanSha256:plan.reference.sha256},null,2)+'\n');console.log(path);
