import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
function safePath(path) {
 if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').includes('..')||posix.normalize(path)!==path)throw new Error(`Invalid artifact path ${path}`);
 return path;
}
/** Pure replay: all bytes come from the supplied reader; no writes, process or Git calls. */
export function buildModernVisualReviewManifest({version,source,indexPath,indexBytes,readBytes,generatedAt,command}) {
 safePath(indexPath);
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)||!Number.isFinite(Date.parse(generatedAt)))throw new Error('Invalid review version/time');
 if(!source||['commit','tree','lockfileSha256','fingerprint'].some(key=>typeof source[key]!=='string'||!source[key]))throw new Error('Missing source identity');
 const input=JSON.parse(Buffer.from(indexBytes).toString('utf8'));
  if (input.version !== version || Object.entries(source).some(([key, value]) => input.source?.[key] !== value)) throw new Error('Artifact index version/source does not match frozen source');
  const scopes = ['flagship-routes', 'showcase-games', 'aura-clash', 'night-adoption', 'crowd-adoption', 'selected-threejs-comparison'];
  const seen = new Set();
  const sections = scopes.map(id => {
    const matches = input.sections?.filter(section => section.id === id) ?? [];
    if (matches.length !== 1 || !matches[0].approvalScope?.trim() || !matches[0].artifacts?.length) throw new Error(`Missing/duplicate/empty review scope ${id}`);
    const section = matches[0];
    const artifacts = section.artifacts.map(artifact => {
      const path = safePath(artifact.path);
      if (!path || path.startsWith('..') || isAbsolute(path) || seen.has(path)) throw new Error(`Invalid/duplicate artifact ${path}`);
      seen.add(path);
      if (Object.entries(source).some(([key, value]) => artifact.source?.[key] !== value)) throw new Error(`Wrong-source artifact ${path}`);
      const bytes = Buffer.from(readBytes(path));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (/\.png$/i.test(path)) { if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20)) throw new Error(`Unreadable PNG ${path}`); }
      else if (/\.json$/i.test(path)) JSON.parse(bytes.toString('utf8'));
      else if (/\.webm$/i.test(path)) { if (bytes.subarray(0, 4).toString('hex') !== '1a45dfa3') throw new Error(`Unreadable WebM ${path}`); }
      else if (/\.mp4$/i.test(path)) { if (bytes.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error(`Unreadable MP4 ${path}`); }
      else throw new Error(`Unsupported review artifact format ${path}`);
      if (!bytes.length || sha256 !== artifact.sha256 || !artifact.producer?.command || !artifact.producer?.report) throw new Error(`Missing producer or changed artifact ${path}`);
      const report = artifact.producer.report;
      if (!report.path || !report.sha256 || createHash('sha256').update(Buffer.from(readBytes(safePath(report.path)))).digest('hex') !== report.sha256) throw new Error(`Missing/changed producer report for ${path}`);
      const producerReport = JSON.parse(Buffer.from(readBytes(safePath(report.path))).toString('utf8'));
      if (Object.entries(source).some(([key, value]) => producerReport.source?.[key] !== value)) throw new Error(`Wrong-source producer report for ${path}`);
      return { ...artifact, path, sha256, bytes: bytes.length };
    });
    return { id, approvalScope: section.approvalScope, artifacts, fileCount: artifacts.length };
  });
  if (input.sections.length !== scopes.length) throw new Error('Unexpected review scope');
  return { schema: 'aura3d.final-visual-review-manifest/2.0', version, generatedAt: generatedAt, command: command, cwd: '.', source, sourceCommit: source.commit, sourceFingerprint: source.fingerprint, artifactIndex: { path: indexPath, sha256: createHash('sha256').update(indexBytes).digest('hex') }, status: 'independent-human-approval-pending', claimBoundary: 'Review applies only to the exact artifacts and scopes listed; this producer cannot approve them.', sectionCount: sections.length, artifactCount: seen.size, sections };
 }
export function validateModernVisualReviewManifest(manifest,source,readBytes) {
 try {
  if(!manifest?.artifactIndex?.path||!manifest.artifactIndex.sha256)throw new Error('Missing artifact index');
  const indexBytes=Buffer.from(readBytes(safePath(manifest.artifactIndex.path)));
  if(createHash('sha256').update(indexBytes).digest('hex')!==manifest.artifactIndex.sha256)throw new Error('Changed artifact index');
  const rebuilt=buildModernVisualReviewManifest({version:manifest.version,source,indexPath:manifest.artifactIndex.path,indexBytes,readBytes,generatedAt:manifest.generatedAt,command:manifest.command});
  if(!isDeepStrictEqual(manifest,rebuilt))throw new Error('Visual manifest differs from replayed artifacts');
  return [];
 }catch(error){return [error instanceof Error?error.message:String(error)];}
}
