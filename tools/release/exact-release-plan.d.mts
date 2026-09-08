export interface ExactReleasePlan { version:string; source:{commit:string;tree:string;fingerprint:string;lockfileSha256:string}; reference:{path:string;sha256:string}; packages:{name:string;version:string;tarball:string;sha256:string;integrity:string}[] }
export function loadValidatedReleasePlan(root?:string,path?:string):ExactReleasePlan|null;
export function inspectInstalledRelease(root:string,project:string,plan:ExactReleasePlan):{project:string;lockfileSha256:string;packages:unknown[]};
