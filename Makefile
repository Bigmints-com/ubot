.PHONY: all build build-backend build-web install update uninstall clean dev help

# ─── Shell & PATH (ensure nvm-managed node/npm is found) ────────────────────
SHELL := /bin/bash
# Dynamically find the nvm-managed node directory (works across versions & platforms)
NVM_NODE_DIR := $(shell ls -d $(HOME)/.nvm/versions/node/v22.*/bin 2>/dev/null | tail -1)
export PATH := $(NVM_NODE_DIR):$(HOME)/.local/bin:$(PATH)

# ─── Variables ──────────────────────────────────────────────────────────────────
UBOT_HOME ?= $(HOME)/.ubot
INSTALL_BIN_DIR ?= $(HOME)/.local/bin
CORE_DIR = ubot-core
WEB_DIR = $(CORE_DIR)/web-ui
CLI_DIR = cli

# Marker file written after a successful first install
INSTALL_MARKER = $(UBOT_HOME)/.installed

# ─── Default ────────────────────────────────────────────────────────────────────
all: build

## check-deps: Verify critical system dependencies before installation
check-deps:
	@echo "🔍 Checking system dependencies..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "❌ Node.js is not installed! Ubot requires Node.js v22 or higher. Please install it."; \
		exit 1; \
	fi
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "❌ NPM is not installed! Please install NPM."; \
		exit 1; \
	fi
	@NODE_VER=$$(node -v | sed 's/v//' | cut -d. -f1); \
	if [ "$$NODE_VER" -lt 22 ] 2>/dev/null; then \
		echo "❌ Node.js v22 or higher is absolutely required (found $$(node -v)). Please upgrade."; \
		exit 1; \
	fi
	@echo "   ✅ Environment validated."

## build: Build everything (backend + web UI)
build: check-deps build-backend build-web
	@echo ""
	@echo "✅ Build complete! Run 'make install' to install."

## build-backend: Compile TypeScript backend
build-backend:
	@echo "🔧 Building backend..."
	@cd $(CORE_DIR) && npm run build
	@echo "   Backend build complete."

## build-web: Build Next.js static export
build-web:
	@echo "🎨 Building web UI..."
	@cd $(WEB_DIR) && npm run build
	@echo "   Web UI build complete."

## install: First-time install of ubot to ~/.ubot and CLI to ~/.local/bin
install: build
	@if [ -f "$(INSTALL_MARKER)" ]; then \
		echo ""; \
		echo "❌ Ubot is already installed at $(UBOT_HOME)"; \
		echo "   Use 'make update' to update to the latest code."; \
		echo "   Use 'make install-force' to reinstall from scratch (keeps data)."; \
		echo ""; \
		exit 1; \
	fi
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=1
	@echo ""
	@echo "✅ Ubot installed!"
	@echo ""
	@echo "   Get started:  ubot start"
	@echo "   Dashboard:    http://localhost:11490"
	@echo "   Config:       $(UBOT_HOME)/config.json"
	@echo ""
	@echo "   🔐 Login with the username and password you set above."
	@echo "      To change later: edit server.access_username/access_password in config.json"

## install-force: Reinstall even if already installed (keeps user data)
install-force: build
	@echo ""
	@echo "⚠️  Force-reinstalling Ubot to $(UBOT_HOME) ..."
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=1
	@echo ""
	@echo "✅ Ubot reinstalled!"
	@$(MAKE) --no-print-directory _post_install_info

## update: Update an existing installation with the latest code
update: build
	@if [ ! -f "$(INSTALL_MARKER)" ]; then \
		echo ""; \
		echo "❌ Ubot is not installed yet."; \
		echo "   Run 'make install' first."; \
		echo ""; \
		exit 1; \
	fi
	@echo ""
	@echo "🔄 Updating Ubot at $(UBOT_HOME) ..."
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=0
	@echo ""
	@echo "✅ Ubot updated!"
	@$(MAKE) --no-print-directory _post_install_info

# ─── Internal: shared install/update logic ──────────────────────────────────────

_do_install:
	@echo ""
	@echo "📦 $(if $(filter 1,$(FIRST_INSTALL)),Installing,Updating) Ubot at $(UBOT_HOME) ..."

	@# ── Create directory structure ──────────────────────────────────────
	@# User data directories (NEVER replaced by install):
	@#   data/           → database (personas, skills, memories, chats)
	@#   creds/          → OAuth credentials and tokens
	@#   sessions/       → WhatsApp session data
	@#   logs/           → Server logs
	@#   browser-profile/→ Chrome profile for browser automation
	@#   workspace/      → CLI project files
	@#   custom/         → Custom tool modules
	@#   config.json     → User configuration (merged, never overwritten)
	@mkdir -p $(UBOT_HOME)/lib
	@mkdir -p $(UBOT_HOME)/web
	@mkdir -p $(UBOT_HOME)/data
	@mkdir -p $(UBOT_HOME)/data/models
	@mkdir -p $(UBOT_HOME)/logs
	@mkdir -p $(UBOT_HOME)/sessions
	@mkdir -p $(UBOT_HOME)/creds

	@mkdir -p $(UBOT_HOME)/workspace
	@mkdir -p $(UBOT_HOME)/custom/modules
	@mkdir -p $(UBOT_HOME)/custom/staging
	@mkdir -p $(UBOT_HOME)/workspace/skills

	@# Copy default skills (only if skill dir doesn't already exist — respects user deletions)
	@if [ -d $(CORE_DIR)/skills ]; then \
		for skill_dir in $(CORE_DIR)/skills/*/; do \
			skill_name=$$(basename "$$skill_dir"); \
			if [ ! -d "$(UBOT_HOME)/workspace/skills/$$skill_name" ]; then \
				cp -r "$$skill_dir" "$(UBOT_HOME)/workspace/skills/$$skill_name"; \
			fi; \
		done; \
		echo "   Synced default skills to $(UBOT_HOME)/workspace/skills/"; \
	fi

	@# Copy default agents (e.g. Nexus orchestrator - respects user deletions)
	@mkdir -p $(UBOT_HOME)/workspace/agents
	@if [ -d $(CORE_DIR)/agents ]; then \
		for agent_file in $(CORE_DIR)/agents/*; do \
			if [ -f "$$agent_file" ]; then \
				agent_name=$$(basename "$$agent_file"); \
				if [ ! -e "$(UBOT_HOME)/workspace/agents/$$agent_name" ]; then \
					cp "$$agent_file" "$(UBOT_HOME)/workspace/agents/$$agent_name"; \
				fi; \
			fi; \
		done; \
		echo "   Synced default agents to $(UBOT_HOME)/workspace/agents/"; \
	fi


	@# ── Application code (replaced on every install/update) ────────────
	@# These are safe to replace — they contain only compiled code, not user data.

	@# Copy compiled backend (clean copy to avoid stale files)
	@rm -rf $(UBOT_HOME)/lib
	@cp -R $(CORE_DIR)/dist $(UBOT_HOME)/lib
	@echo "   Installed backend to $(UBOT_HOME)/lib/"

	@# Copy node_modules (needed at runtime)
	@mkdir -p $(UBOT_HOME)/node_modules
	@cp -R $(CORE_DIR)/node_modules/* $(UBOT_HOME)/node_modules/ 2>/dev/null || true
	@# Fix whisper addon platform naming (mac-arm64 → darwin-arm64)
	@if [ -f $(CORE_DIR)/scripts/fix-whisper-addon.sh ]; then \
		ADDON_DIR="$(UBOT_HOME)/node_modules/@kutalia/whisper-node-addon/dist"; \
		if [ -d "$$ADDON_DIR" ]; then \
			([ -d "$$ADDON_DIR/mac-arm64" ] && [ ! -e "$$ADDON_DIR/darwin-arm64" ] && ln -sf mac-arm64 "$$ADDON_DIR/darwin-arm64") || true; \
			([ -d "$$ADDON_DIR/mac-x64" ] && [ ! -e "$$ADDON_DIR/darwin-x64" ] && ln -sf mac-x64 "$$ADDON_DIR/darwin-x64") || true; \
		fi; \
	fi
	@# Rebuild native modules for the current Node.js version (prevents ERR_DLOPEN_FAILED)
	@cd $(UBOT_HOME) && npm rebuild 2>/dev/null || true
	@echo "   Installed dependencies to $(UBOT_HOME)/node_modules/"

	@# Copy static web UI (clean copy)
	@if [ -d $(WEB_DIR)/out ]; then \
		rm -rf $(UBOT_HOME)/web; \
		mkdir -p $(UBOT_HOME)/web; \
		cp -r $(WEB_DIR)/out/* $(UBOT_HOME)/web/; \
		echo "   Installed web UI to $(UBOT_HOME)/web/"; \
	else \
		echo "   ⚠️  No web export found (expected $(WEB_DIR)/out/)"; \
	fi

	@# ── Config (merge, never overwrite) ────────────────────────────────
	@if [ ! -f $(UBOT_HOME)/config.json ]; then \
		cp $(CLI_DIR)/default-config.json $(UBOT_HOME)/config.json; \
		echo "   Created default config at $(UBOT_HOME)/config.json"; \
	else \
		python3 $(CLI_DIR)/merge-config.py $(UBOT_HOME)/config.json $(CLI_DIR)/default-config.json; \
	fi

	@# ── Copy Migrations explicitly for Setup Wizard ───────────────
	@rm -rf $(UBOT_HOME)/migrations
	@cp -R $(CORE_DIR)/supabase/migrations $(UBOT_HOME)/migrations
	@echo "   Prepared auto-migration scripts in $(UBOT_HOME)/migrations/"

	@# ── Interactive Initialization Wizard (first install only) ──
	@if [ "$(FIRST_INSTALL)" = "1" ]; then \
		echo ""; \
		UBOT_HOME=$(UBOT_HOME) node $(UBOT_HOME)/lib/cli/wizard.js; \
		echo ""; \
	fi

	@# Install CLI to PATH
	@mkdir -p $(INSTALL_BIN_DIR)
	@cp $(CLI_DIR)/ubot $(INSTALL_BIN_DIR)/ubot
	@chmod +x $(INSTALL_BIN_DIR)/ubot
	@echo "   Installed CLI to $(INSTALL_BIN_DIR)/ubot"

	@# ── Write install marker ───────────────────────────────────────────
	@date -u +"%Y-%m-%dT%H:%M:%SZ" > "$(INSTALL_MARKER)"
	@echo "   Install marker written."

_post_install_info:
	@# ── Auto-restart if server is running ──────────────────────────────
	@if [ -f $(UBOT_HOME)/ubot.pid ] && kill -0 $$(cat $(UBOT_HOME)/ubot.pid) 2>/dev/null; then \
		echo ""; \
		echo "🔄 Server is running — restarting with new code..."; \
		$(INSTALL_BIN_DIR)/ubot restart; \
	else \
		echo ""; \
		echo "   Start with:   ubot start"; \
	fi
	@echo "   Dashboard:    http://localhost:11490"
	@echo "   Config:       $(UBOT_HOME)/config.json"

## uninstall: Remove ubot CLI (keeps data)
uninstall:
	@echo "🗑  Removing ubot CLI..."
	@rm -f $(INSTALL_BIN_DIR)/ubot
	@echo "   Removed CLI from $(INSTALL_BIN_DIR)/ubot"
	@echo ""
	@echo "   Note: Data is preserved at $(UBOT_HOME)/"
	@echo "   To remove everything: make uninstall-all"

## uninstall-all: Remove ubot CLI and all data
uninstall-all: uninstall
	@echo "🗑  Removing all ubot data..."
	@rm -rf $(UBOT_HOME)
	@echo "   Removed $(UBOT_HOME)/"

## clean: Remove build artifacts
clean:
	@echo "🧹 Cleaning..."
	@cd $(CORE_DIR) && npm run clean 2>/dev/null || true
	@rm -rf $(WEB_DIR)/out $(WEB_DIR)/.next
	@echo "   Clean complete."

## dev: Run in development mode (existing behavior)
dev:
	@cd $(CORE_DIR) && npm run dev

## deps: Install all dependencies
deps:
	@echo "📥 Installing dependencies..."
	@cd $(CORE_DIR) && npm install
	@cd $(WEB_DIR) && npm install
	@echo "   Dependencies installed."

## help: Show this help
help:
	@echo "🤖 Ubot Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo ""
	@echo "Variables:"
	@echo "  UBOT_HOME        Runtime directory (default: ~/.ubot)"
	@echo "  INSTALL_BIN_DIR   CLI install directory (default: ~/.local/bin)"
