# shellcheck shell=bash
# Legacy (4.x) artifact transport for native acceptance when no
# identity-enabled ACR task exists (5.0 decision: picassostagingacr has no ACR
# tasks; creating one would widen IAM trust). Sourced by run.sh and
# run-acceptance5.sh; requires $AZ_WRAPPER.
#
# - Existing storage account aidprogsnap1009gch (aid-programs-store-rg),
#   existing container aura3d-remote-acr. Nothing is created.
# - One account-key container SAS per launcher invocation, perms rcwl (no
#   delete), https-only, lifetime <= 120 min.
# - The account key and SAS live only in shell variables, child-process env
#   (AZURE_STORAGE_KEY for `az storage`) and a 0600 values file inside a 0700
#   temp dir that is the `az acr run` context. They are never echoed and never
#   placed in argv. `az acr run --set-secret` cannot carry the value (verified
#   in d0447d1cd), so the task reads it with `--values` from that context.
A3D_SAS_STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-aidprogsnap1009gch}"
A3D_SAS_STORAGE_RG="${STORAGE_RG:-aid-programs-store-rg}"
A3D_SAS_CONTAINER="${BLOB_CONTAINER:-aura3d-remote-acr}"
A3D_SAS_PERMISSIONS=rcwl
A3D_SAS_VALUES_FILE=artifact-transport.values.yaml
A3D_SAS_KEY=""
A3D_SAS_DIR=""
A3D_SAS_EXPIRY_EPOCH=0

# sas_transport_open <ttl-minutes> <task-yaml>...   copies the task files into $A3D_SAS_DIR
sas_transport_open() {
  local ttl="$1"; shift
  [[ "$ttl" =~ ^[0-9]+$ ]] && [ "$ttl" -ge 31 ] && [ "$ttl" -le 120 ] || { echo "FATAL: SAS lifetime must be 31..120 minutes." >&2; return 2; }
  [[ "$A3D_SAS_STORAGE_ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] && [[ "$A3D_SAS_CONTAINER" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] \
    && [[ "$A3D_SAS_STORAGE_RG" =~ ^[A-Za-z0-9._()-]{1,90}$ ]] || { echo "FATAL: invalid storage target." >&2; return 2; }
  A3D_SAS_KEY="$("$AZ_WRAPPER" storage account keys list -n "$A3D_SAS_STORAGE_ACCOUNT" -g "$A3D_SAS_STORAGE_RG" --query '[0].value' -o tsv 2>/dev/null)" || A3D_SAS_KEY=""
  [ -n "$A3D_SAS_KEY" ] || { echo "FATAL: cannot read the storage account key for ${A3D_SAS_STORAGE_ACCOUNT}." >&2; return 2; }
  local exists
  exists="$(AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage container exists --name "$A3D_SAS_CONTAINER" \
    --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --query exists -o tsv 2>/dev/null)" || exists=""
  [ "$exists" = true ] || { echo "FATAL: container ${A3D_SAS_STORAGE_ACCOUNT}/${A3D_SAS_CONTAINER} is missing; this launcher does not create it." >&2; return 2; }
  A3D_SAS_EXPIRY_EPOCH=$(( $(date -u +%s) + ttl * 60 ))
  local expiry token
  expiry="$(date -u -r "$A3D_SAS_EXPIRY_EPOCH" +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -d "@$A3D_SAS_EXPIRY_EPOCH" +%Y-%m-%dT%H:%MZ)"
  token="$(AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage container generate-sas --name "$A3D_SAS_CONTAINER" \
    --account-name "$A3D_SAS_STORAGE_ACCOUNT" --permissions "$A3D_SAS_PERMISSIONS" --expiry "$expiry" --https-only -o tsv 2>/dev/null)" || token=""
  case "$token" in ''|*"'"*|*[[:space:]]*) token=""; echo "FATAL: SAS could not be minted." >&2; return 2;; esac
  A3D_SAS_DIR="$(mktemp -d /tmp/aura3d-sas-run.XXXXXX)"
  chmod 700 "$A3D_SAS_DIR"
  local task
  for task in "$@"; do cp "$task" "$A3D_SAS_DIR/"; done
  ( umask 077; printf "ARTIFACTS_SAS: '%s'\n" "https://${A3D_SAS_STORAGE_ACCOUNT}.blob.core.windows.net/${A3D_SAS_CONTAINER}?${token}" > "$A3D_SAS_DIR/$A3D_SAS_VALUES_FILE" )
  token=""
  echo "   transport  : legacy-sas ${A3D_SAS_STORAGE_ACCOUNT}/${A3D_SAS_CONTAINER} perms=${A3D_SAS_PERMISSIONS} expiry=${expiry} (value not shown)"
}

sas_seconds_left() { echo $(( A3D_SAS_EXPIRY_EPOCH - $(date -u +%s) )); }

# sas_download_prefix <blob-prefix> <dest-dir>
sas_download_prefix() {
  [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || return 2
  mkdir -p "$2"
  AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage blob download-batch --source "$A3D_SAS_CONTAINER" \
    --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --pattern "$1/*" --destination "$2" -o none --only-show-errors
}

# Redact any credential-shaped text from a local log in place.
sas_redact_file() {
  [ -f "$1" ] || return 0
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { redactText } from "./tools/remote-acr/upload-artifacts.mjs";
    const f = process.argv[1]; writeFileSync(f, redactText(readFileSync(f, "utf8")));
  ' "$1"
}

sas_transport_close() {
  [ -z "$A3D_SAS_DIR" ] || rm -rf "$A3D_SAS_DIR"
  A3D_SAS_DIR=""; A3D_SAS_KEY=""
}
