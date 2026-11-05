import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishTag, publishCommand, registryViewSpec } from './publish-tag.mjs';

test('no --tag keeps the npm default', () => {
  assert.equal(parsePublishTag(['--from-plan', 'p.json']), null);
  assert.equal(publishCommand('/t/a.tgz', null), 'npm publish "/t/a.tgz" --access public');
  assert.equal(registryViewSpec('@aura3d/engine', null), '@aura3d/engine');
});
test('--tag next is passed to npm publish and registry verification', () => {
  assert.equal(parsePublishTag(['--from-plan', 'p.json', '--tag', 'next']), 'next');
  assert.equal(publishCommand('/t/a.tgz', 'next', ' --otp "1"'), 'npm publish "/t/a.tgz" --access public --tag next --otp "1"');
  assert.equal(registryViewSpec('@aura3d/engine', 'next'), '@aura3d/engine@next');
});
test('--tag rejects a missing, flag-like or version-like value', () => {
  assert.throws(() => parsePublishTag(['--tag']), /--tag requires/);
  assert.throws(() => parsePublishTag(['--tag', '--dry-run']), /--tag requires/);
  assert.throws(() => parsePublishTag(['--tag', '5.0.1']), /--tag/);
  assert.throws(() => parsePublishTag(['--tag', 'next;rm']), /--tag requires/);
});
