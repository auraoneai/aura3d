# Real-GPU verification: blocked, no compliant route (2026-10-23)

**Result: NOT RUN.** No browser spec was executed on real GPU hardware. Every compliant route to a GPU was checked and is denied or unusable. No cloud resource was created, so cost is **$0** and runtime is **0**. Nothing is pending cleanup.

Everything previously verified remains **software-rendered** (SwiftShader WebGL2/WebGPU on ACR; headed Chromium under Xvfb for WebGPU canvas presentation). Hardware-GPU rendering, driver behaviour, real frame pacing and GPU memory remain unverified. WebXR on a real headset is separately untestable here.

## Routes tried and the exact denials

| Route | Check | Result |
| --- | --- | --- |
| Azure GPU VM (`az-auraone-gurbaksh`, sub `9b7da706-63ce-4740-8c03-3b77cbe1b7d0`) | `az vm list-usage` in eastus, eastus2, westus2, westus3, southcentralus, centralus, northcentralus, westeurope, northeurope, uksouth, swedencentral | Every N-series GPU family has limit **0** (incl. `Standard NCASv3_T4 Family`, `StandardNVADSA10v5Family`, `StandardNCADSA10v4Family`). Spot cores `lowPriorityCores` 0/3. |
| Azure self-service quota request | `az quota create` in `/subscriptions/<sub>/providers/Microsoft.Compute/locations/eastus` | `Standard NCASv3_T4 Family`, value 4: **`QuotaNotAvailableForResource`**. `StandardNVADSA10v5Family`, value 6: **`ContactSupport`**. `StandardNCADSA10v4Family`, value 8: **`ContactSupport`**. Nothing was changed. |
| Azure SKU availability | `az vm list-skus --size Standard_NC4as_T4_v3` | Offered with **no restrictions** in eastus, eastus2, westus2, southcentralus (so quota is the only blocker). |
| AWS CodeBuild GPU | `codebuild:ListProjects` as `AuraOneProductionOperator` (`auraone-production-operator`), us-west-2 | **AccessDenied** (no identity-based policy allows it). Not escalated: running arbitrary code under an existing production-capable CodeBuild role, or root escalation, is out of scope. |
| AWS service quota read | `servicequotas:GetServiceQuota` (L-DB2E81BA, G/VT vCPUs) | **AccessDenied** |
| AWS EC2 via the gated runner (`auraone-remote-run`, `lt-001ac3e8c702c66d7`) | `ec2 run-instances --dry-run` with the required tags and `--instance-type g4dn.xlarge` | `DryRunOperation` (permission passes), but the route is **unusable**: the template is an `r7i.8xlarge` running AMI `auraone-human-ei-runner-v12` ("isolated Human Data/EI remote acceptance runner"); its subnet `subnet-056ccb403a7b5c45c` has routes only to the local CIDR and one gateway VPC endpoint (no NAT, no internet), no public IP, no keypair; the launcher (`AuraOne/scripts/release/launch-human-ei-remote-runner.sh`) uploads an Object-Lock git bundle and runs a fixed executor, not arbitrary commands. A GPU box could not download NVIDIA drivers, Chrome or Playwright, and the skill forbids image or resource overrides. No instance was launched. |
| GCP | policy funding snapshot | `gcloud-credits` billing marked unavailable. Not attempted. |
| The Mac's own GPU | policy | Automated browser suites on the Mac are prohibited (remote-only). Not used. |

## Minimum action needed to unblock

One of:
1. **Approve Azure GPU quota** (needs a Microsoft support request or the Azure portal *Quotas* blade; a human action on subscription `9b7da706-...`): **4 vCPUs of `Standard NCASv3_T4 Family` in `eastus`** (one `Standard_NC4as_T4_v3`, 1x NVIDIA T4, listed at roughly US$0.53/hour; a full matrix run is about one hour). The T4 supports Vulkan graphics with the standard NVIDIA driver, which Chrome's ANGLE-Vulkan and WebGPU need. The run would use an ephemeral resource group (`rg-ci-ephemeral-gpu-<ts>`) deleted whole, with the GPU, driver, Chrome and ANGLE backend recorded per run.
2. Alternatively, provide an AWS GPU path (an isolated non-production subnet with egress and a GPU image) designed for this workload; the current Human-EI runner is not it.

## What is ready to run once a GPU exists

The spec order and evidence layout are fixed: `webgpu-presentation-probe`, `parity-shader` (canvas path), `parity-compute`, `parity-tsl`, `custom-draw-probe`, `parity-instancing` (batched multi-draw), `parity-post`, `parity-runtime`, `parity-xr`, then the `*-port` specs, saving frames under `evidence/hardware-gpu/<game>/` and recording GPU name, driver, Chrome version and the ANGLE backend with every run so the evidence proves hardware rendering rather than SwiftShader. No automation was written for it, because it could not be tested here.

## Cleanup proof (2026-10-23)

- AWS us-west-2: `describe-instances` filtered on `auraone:managed-by=human-ei-remote-runner-v1` (all non-terminated states) returns `[]`; volumes tagged `auraone:attempt-id=gpu-dryrun*` return `[]`. The two dry-runs created nothing.
- Azure: no VM or resource group matching `gpu` or `rg-ci-ephemeral*` exists. The failed quota requests changed nothing.
