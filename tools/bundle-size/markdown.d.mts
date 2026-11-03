export interface BundleMarkdownRow {readonly label:string;readonly jsBytes:number;readonly gzipBytes:number;readonly budget:number;readonly enforced:boolean;readonly sizeLimitPassed:boolean;}
export type BundleCandidate =
  | { readonly status: 'bound'; readonly releasePlan: { readonly path: string; readonly sha256: string }; readonly version: string; readonly source: { readonly commit: string; readonly fingerprint: string; readonly lockfileSha256: string } }
  | { readonly status: 'unbound'; readonly reason: string };
export function renderBundleSizeMarkdown(results:readonly BundleMarkdownRow[], candidate?:BundleCandidate, reportPath?:string):string;
