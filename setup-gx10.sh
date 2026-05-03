#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UBOT GX10 Bootstrap Script
# Run this ON the GX10 machine (or via: ssh bigmints@100.77.38.96 'bash -s' < setup-gx10.sh)
#
# What this does:
#   1. Creates ~/Projects/ubot-workspace/
#   2. Clones the UBOT repo
#   3. Installs backend + web-ui npm dependencies
#   4. Creates a dev-friendly config.json stub
#   5. Installs the ubot CLI to ~/.local/bin
#   6. Adds a systemd user service (ubot-dev) that auto-starts on login
#   7. Prints next steps
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/Bigmints-com/ubot.git"
WORKSPACE="$HOME/Projects/ubot-workspace"
UBOT_REPO="$WORKSPACE/ubot"
UBOT_CORE="$UBOT_REPO/ubot-core"
BRANCH="${BRANCH:-feature/multi-agent-crew}"   # override: BRANCH=main ./setup-gx10.sh

# ── Colour helpers ────────────────────────────────────────────────────────────
bold=$(tput bold 2>/dev/null || echo "")
reset=$(tput sgr0 2>/dev/null || echo "")
green="\033[0;32m"
yellow="\033[1;33m"
red="\033[0;31m"
nc="\033[0m"

info()    { echo -e "${green}▶${nc} $*"; }
warn()    { echo -e "${yellow}⚠${nc}  $*"; }
success() { echo -e "${green}✓${nc} ${bold}$*${reset}"; }
die()     { echo -e "${red}✗${nc} $*" >&2; exit 1; }

# ── 0. Load nvm so node/npm are in PATH ──────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

node --version >/dev/null 2>&1 || die "Node.js not found. Install nvm + Node v22 first:
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  source ~/.nvm/nvm.sh
  nvm install 22 && nvm use 22 && nvm alias default 22"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[[ "$NODE_VER" -lt 22 ]] && die "Node v22+ required, found $(node -v). Run: nvm install 22 && nvm alias default 22"
info "Node $(node -v) / npm $(npm -v) ✓"

# ── 1. Clone or update ───────────────────────────────────────────────────────
mkdir -p "$WORKSPACE"

if [ -d "$UBOT_REPO/.git" ]; then
  warn "Repo already exists at $UBOT_REPO — pulling latest from $BRANCH..."
  git -C "$UBOT_REPO" fetch origin
  git -C "$UBOT_REPO" checkout "$BRANCH" 2>/dev/null || git -C "$UBOT_REPO" checkout -b "$BRANCH" origin/"$BRANCH"
  git -C "$UBOT_REPO" pull --rebase origin "$BRANCH"
else
  info "Cloning UBOT ($BRANCH) → $UBOT_REPO"
  git clone --branch "$BRANCH" "$REPO_URL" "$UBOT_REPO"
fi
success "Repo ready at $UBOT_REPO"

# ── 2. Install backend dependencies ─────────────────────────────────────────
info "Installing backend deps ($UBOT_CORE)..."
(cd "$UBOT_CORE" && npm install --prefer-offline)
success "Backend deps installed"

# ── 3. Install web-ui dependencies ──────────────────────────────────────────
info "Installing web-ui deps ($UBOT_CORE/web-ui)..."
(cd "$UBOT_CORE/web-ui" && npm install --prefer-offline)
success "Web-ui deps installed"

# ── 4. Create a minimal config.json for dev mode ────────────────────────────
CONFIG="$UBOT_CORE/config.json"
if [ ! -f "$CONFIG" ]; then
  info "Creating minimal dev config at $CONFIG ..."
  cat > "$CONFIG" <<'EOF'
{
  "server": {
    "port": 11490,
    "access_username": "admin",
    "access_password": "changeme"
  },
  "database": {
    "provider": "sqlite"
  },
  "llm": {
    "default_provider": "openai_compatible",
    "providers": {
      "openai_compatible": {
        "base_url": "http://localhost:8080/v1",
        "api_key": "none",
        "model": "gx10-model"
      }
    }
  },
  "channels": {
    "webchat": { "enabled": true },
    "whatsapp": { "enabled": false },
    "telegram": { "enabled": false },
    "imessage": { "enabled": false }
  }
}
EOF
  success "Config created — edit $CONFIG before starting"
else
  warn "Config already exists at $CONFIG — skipping"
fi

# ── 5. Install CLI to ~/.local/bin ───────────────────────────────────────────
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
CLI_SRC="$UBOT_REPO/cli/ubot"
if [ -f "$CLI_SRC" ]; then
  cp "$CLI_SRC" "$BIN_DIR/ubot"
  chmod +x "$BIN_DIR/ubot"
  success "CLI installed → $BIN_DIR/ubot"
else
  warn "cli/ubot not found — skipping CLI install (build first with 'make build')"
fi

# ── 6. systemd user service (ubot-dev) ──────────────────────────────────────
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

# Resolve the absolute node path from nvm
NODE_BIN="$(command -v node)"

cat > "$SYSTEMD_DIR/ubot-dev.service" <<EOF
[Unit]
Description=UBOT Dev Server (GX10)
After=network.target

[Service]
Type=simple
WorkingDirectory=$UBOT_CORE
Environment="NODE_ENV=development"
Environment="PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=$NODE_BIN -r tsx/cjs $UBOT_CORE/src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Try to enable (only works if systemd --user is running, which it might not be on GX10 headless)
if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable ubot-dev.service 2>/dev/null; then
  success "systemd user service 'ubot-dev' enabled (start: systemctl --user start ubot-dev)"
else
  warn "systemd --user not available (headless server). Use the start.sh script instead."
fi

# ── 7. Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${bold}═══════════════════════════════════════════════════════${reset}"
echo -e "${bold}  UBOT GX10 Bootstrap Complete!${reset}"
echo -e "${bold}═══════════════════════════════════════════════════════${reset}"
echo ""
echo "  Repo:         $UBOT_REPO"
echo "  Branch:       $BRANCH"
echo "  Config:       $CONFIG"
echo "  Dashboard:    http://100.77.38.96:11490"
echo ""
echo -e "${bold}Next Steps:${reset}"
echo ""
echo "  1. Edit config.json to set your LLM provider & password"
echo "  2. Build:     cd $UBOT_REPO && make build"
echo "  3. Install:   cd $UBOT_REPO && make install"
echo "  4. Start:     ubot start"
echo ""
echo "  Or run in dev mode (no build required):"
echo "     cd $UBOT_CORE && npm run dev"
echo ""
echo "  VSCode SSH:   Open VS Code → Remote-SSH → bigmints@100.77.38.96"
echo "     Then: File → Open Folder → $UBOT_CORE"
echo ""
