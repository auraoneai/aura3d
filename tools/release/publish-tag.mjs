// npm dist-tag selection for publish-all.mjs. Default (no --tag) keeps npm's own default (`latest`).
const TAG_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
export function parsePublishTag(argv) {
  const index = argv.indexOf('--tag');
  if (index < 0) return null;
  const tag = argv[index + 1];
  if (!tag || tag.startsWith('--') || !TAG_PATTERN.test(tag)) throw new Error('--tag requires a dist-tag name such as next');
  if (/^\d+(\.\d+)*$/.test(tag)) throw new Error('--tag must not look like a version');
  return tag;
}
export function publishCommand(tarball, tag, otpArg = '') {
  return `npm publish ${JSON.stringify(tarball)} --access public${tag ? ` --tag ${tag}` : ''}${otpArg}`;
}
export function registryViewSpec(name, tag) {
  return tag ? `${name}@${tag}` : name;
}
