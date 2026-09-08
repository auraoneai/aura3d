import {test} from 'node:test';import assert from 'node:assert/strict';import {withNpmTransport} from './npm-transport.mjs';
test('empty pnpm lowercase config cannot override authorized HTTPS proxy',()=>assert.deepEqual(withNpmTransport(['install','x.tgz'],{HTTPS_PROXY:'https://proxy.example:443',npm_config_proxy:''}),['install','--proxy=https://proxy.example/','--https-proxy=https://proxy.example/','x.tgz']));
test('explicit command transport retained unchanged',()=>assert.deepEqual(withNpmTransport(['install','--proxy=https://explicit.example','x'],{HTTPS_PROXY:'https://other.example'}),['install','--proxy=https://explicit.example','x']));
test('no proxy environment preserves original command',()=>assert.deepEqual(withNpmTransport(['install','x'],{}),['install','x']));
test('credentials cannot leak into recorded CLI argv',()=>assert.throws(()=>withNpmTransport(['install'],{HTTPS_PROXY:'https://user:secret@proxy.example'}),/without embedded credentials/));
test('non-network npm run is unchanged',()=>assert.deepEqual(withNpmTransport(['run','build'],{HTTPS_PROXY:'https://proxy.example'}),['run','build']));
