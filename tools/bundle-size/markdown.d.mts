export interface BundleMarkdownRow {readonly label:string;readonly jsBytes:number;readonly gzipBytes:number;readonly budget:number;readonly enforced:boolean;readonly sizeLimitPassed:boolean;}
export function renderBundleSizeMarkdown(results:readonly BundleMarkdownRow[]):string;
