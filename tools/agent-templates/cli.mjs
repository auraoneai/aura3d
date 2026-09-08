import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
/** Resolve from the scaffold itself: installed tests and CLI must share one copy. */
export function templateCli(targetDirectory, tool) {
 const localRequire=createRequire(resolve(targetDirectory,'package.json'));
 if(tool==='playwright')return resolve(dirname(localRequire.resolve('@playwright/test/package.json')),'cli.js');
 if(tool==='vite')return resolve(dirname(localRequire.resolve('vite/package.json')),'bin/vite.js');
 throw new Error(`Unsupported template tool: ${tool}`);
}
export function shellArgument(value){return `'${value.replaceAll("'", "'\\''")}'`;}
