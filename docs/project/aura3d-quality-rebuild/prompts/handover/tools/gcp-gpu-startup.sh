#!/bin/bash
# GCP startup script for aura3d GPU runners (label azure-gpu). Runs on every boot.
# Image: deeplearning-platform-release common-cu129-ubuntu-2204-nvidia-580 (driver preinstalled).
# Metadata: runner-name, runner-version, gh-reg-token (removed by the operator after registration).
set -uo pipefail
LOG=/var/log/aura3d-runner-bootstrap.log
exec > >(tee -a "$LOG") 2>&1
export DEBIAN_FRONTEND=noninteractive
MD=http://metadata.google.internal/computeMetadata/v1/instance/attributes
md() { curl -fsS -H 'Metadata-Flavor: Google' "$MD/$1" 2>/dev/null || true; }
REPO_URL="https://github.com/auraoneai/aura3d"
RD=/home/runner/actions-runner

gpu_probe() {
  mkdir -p /opt/aura3d
  cat > /opt/aura3d/probe.html <<'HTML'
<html><body><script>
var c=document.createElement('canvas');var g=c.getContext('webgl2');var r='NO_WEBGL2';
if(g){var e=g.getExtension('WEBGL_debug_renderer_info');r=e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);}
document.body.textContent='RENDERER='+r;
</script></body></html>
HTML
  chmod 644 /opt/aura3d/probe.html
  echo "AURA3D-PROBE nvidia-smi: $(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1 | head -1)"
  echo "AURA3D-PROBE vulkan: $(sudo -u runner vulkaninfo --summary 2>&1 | grep -m1 -i deviceName | tr -s ' ')"
  pgrep -x Xvfb >/dev/null || (sudo -u runner Xvfb :99 -screen 0 1920x1080x24 >/dev/null 2>&1 &)
  sleep 2
  local base="--no-first-run --no-default-browser-check --ignore-gpu-blocklist --enable-unsafe-webgpu --disable-dev-shm-usage --user-data-dir=/tmp/aura3d-probe-profile"
  local i=0
  while IFS='|' read -r label disp flags; do
    i=$((i+1)); rm -rf /tmp/aura3d-probe-profile
    out=$(sudo -u runner env DISPLAY="$disp" timeout 60 google-chrome $base $flags \
      --dump-dom file:///opt/aura3d/probe.html 2>/dev/null | grep -o 'RENDERER=[^<]*' | head -1)
    echo "AURA3D-PROBE [$label] ${out:-RENDERER=<none>}"
  done <<'SETS'
A headless vulkan||--headless=new --use-angle=vulkan --enable-features=Vulkan
B headless angle-gl-egl||--headless=new --use-gl=angle --use-angle=gl-egl
C headless egl||--headless=new --use-gl=egl
D headless angle-gl||--headless=new --use-angle=gl
E xvfb angle-gl|:99|--use-angle=gl
F xvfb vulkan|:99|--use-angle=vulkan --enable-features=Vulkan
G xvfb angle-gl-egl|:99|--use-gl=angle --use-angle=gl-egl
SETS
  rm -rf /tmp/aura3d-probe-profile
  echo "AURA3D-PROBE done"
}

# DLVM ships compute-only NVIDIA packages. Add the matching GL/EGL/Vulkan userspace
# so Chromium (ANGLE) can use the GPU instead of llvmpipe/SwiftShader.
ensure_nvidia_gl() {
  local v; v=$(dpkg-query -W -f='${Version}' libnvidia-compute-580-server 2>/dev/null)
  [ -n "$v" ] || return 0
  dpkg -s libnvidia-gl-580-server >/dev/null 2>&1 || \
    apt-get -o DPkg::Lock::Timeout=900 install -y "libnvidia-gl-580-server=$v" || \
    { apt-get update && apt-get -o DPkg::Lock::Timeout=900 install -y "libnvidia-gl-580-server=$v"; } || true
}
ensure_nvidia_gl

if [ -f "$RD/.runner" ]; then
  echo "runner already configured; ensuring service is up"
  systemctl start "$(cat "$RD/.service")" || true
  gpu_probe
  exit 0
fi

set -e
echo 'DPkg::Lock::Timeout "900";' > /etc/apt/apt.conf.d/99aura3d-locktimeout
apt-get update
apt-get install -y git git-lfs curl jq unzip zip build-essential python3 python3-pip python3-venv \
  xvfb ca-certificates gnupg xz-utils rsync libvulkan1 vulkan-tools mesa-utils

curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  > /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable

curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz -o /tmp/node.tar.xz
tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm -f /tmp/node.tar.xz
/usr/local/bin/npm install -g pnpm@11.1.3
/usr/local/bin/npm exec --yes playwright@1.48.2 -- install-deps || true
git lfs install --system || true

id runner || useradd -m -s /bin/bash runner
usermod -aG video,render runner || true
echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner && chmod 440 /etc/sudoers.d/runner
mkdir -p /opt/hostedtoolcache && chown runner:runner /opt/hostedtoolcache

mkdir -p /opt/runner-hooks
cat > /opt/runner-hooks/clean.sh <<'HOOK'
#!/bin/bash
# Job-started hook. The runner executes this with `bash -e -o pipefail`,
# so every command must be non-failing. Cleans only $GITHUB_WORKSPACE contents.
WS="${GITHUB_WORKSPACE:-}"
case "$WS" in
  /home/runner/actions-runner/_work/?*/?*)
    if [ -d "$WS" ]; then
      rm -rf "${WS:?}"/* "${WS:?}"/.[!.]* 2>/dev/null || true
      echo "[clean.sh] wiped workspace $WS" || true
    fi ;;
  *) echo "[clean.sh] skipped (GITHUB_WORKSPACE='$WS')" || true ;;
esac
exit 0
HOOK
chmod 755 /opt/runner-hooks/clean.sh

VER="$(md runner-version)"; NAME="$(md runner-name)"
mkdir -p "$RD" && cd "$RD"
# Reboot path: already registered. Never re-extract over a live runner or require the
# (deleted) registration token; just make sure the service is running.
if [ -f "$RD/.runner" ]; then
  ./svc.sh start || systemctl restart "actions.runner.*" || true
  echo "AURA3D-RUNNER already registered as $NAME; service started"
  gpu_probe || true
  exit 0
fi
curl -fsSL -o runner.tgz \
  "https://github.com/actions/runner/releases/download/v${VER}/actions-runner-linux-x64-${VER}.tar.gz"
tar xzf runner.tgz && rm -f runner.tgz
{ echo "AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache"; echo "RUNNER_TOOL_CACHE=/opt/hostedtoolcache";
  echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/runner-hooks/clean.sh"; } >> .env
chown -R runner:runner "$RD"
./bin/installdependencies.sh || true

# Never log the registration token.
TOKEN="$(md gh-reg-token)"
LABELS="$(md runner-labels)"; LABELS="${LABELS:-self-hosted,linux,azure-gpu}"
[ -n "$TOKEN" ] || { echo "AURA3D-RUNNER NOT REGISTERED and no gh-reg-token"; systemctl start "actions.runner.*" || true; exit 0; }
sudo -u runner ./config.sh --url "$REPO_URL" --token "$TOKEN" \
  --labels "$LABELS" --unattended --replace --name "$NAME" --work _work \
  || { unset TOKEN; echo "AURA3D-RUNNER registration FAILED"; exit 1; }
unset TOKEN
./svc.sh install runner
./svc.sh start
echo "AURA3D-RUNNER registered as $NAME"
gpu_probe
