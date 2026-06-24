.PHONY: all build build-backend build-web install update uninstall clean dev help

# ─── Shell & PATH (ensure nvm-managed node/npm is found) ────────────────────
SHELL := /bin/bash
# Dynamically find the nvm-managed node directory (works across versions & platforms)
NVM_NODE_DIR := $(shell ls -d $(HOME)/.nvm/versions/node/v22.*/bin 2>/dev/null | tail -1)
export PATH := $(NVM_NODE_DIR):$(HOME)/.local/bin:$(PATH)

# ─── Variables ──────────────────────────────────────────────────────────────────
YOUBOT_HOME ?= $(HOME)/.youbot
INSTALL_BIN_DIR ?= $(HOME)/.local/bin
CORE_DIR = youbot-core
WEB_DIR = $(CORE_DIR)/web-ui
CLI_DIR = cli

# Marker file written after a successful first install
INSTALL_MARKER = $(YOUBOT_HOME)/.installed

# ─── Default ────────────────────────────────────────────────────────────────────
all: build

## check-deps: Verify critical system dependencies before installation
check-deps:
	@echo "🔍 Checking system dependencies..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "❌ Node.js is not installed! Youbot requires Node.js v22 or higher. Please install it."; \
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

## install: First-time install of youbot to ~/.youbot and CLI to ~/.local/bin
install: build
	@if [ -f "$(INSTALL_MARKER)" ]; then \
		echo ""; \
		echo "❌ Youbot is already installed at $(YOUBOT_HOME)"; \
		echo "   Use 'make update' to update to the latest code."; \
		echo "   Use 'make install-force' to reinstall from scratch (keeps data)."; \
		echo ""; \
		exit 1; \
	fi
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=1
	@echo ""
	@echo "✅ Youbot installed!"
	@echo ""
	@echo "   Get started:  youbot start"
	@echo "   Dashboard:    http://localhost:11490"
	@echo "   Config:       $(YOUBOT_HOME)/config.json"
	@echo ""
	@echo "   🔐 Login with the username and password you set above."
	@echo "      To change later: edit server.access_username/access_password in config.json"

## install-force: Reinstall even if already installed (keeps user data)
install-force: build
	@echo ""
	@echo "⚠️  Force-reinstalling Youbot to $(YOUBOT_HOME) ..."
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=1
	@echo ""
	@echo "✅ Youbot reinstalled!"
	@$(MAKE) --no-print-directory _post_install_info

## update: Update an existing installation with the latest code
update: build
	@if [ ! -f "$(INSTALL_MARKER)" ]; then \
		echo ""; \
		echo "❌ Youbot is not installed yet."; \
		echo "   Run 'make install' first."; \
		echo ""; \
		exit 1; \
	fi
	@echo ""
	@echo "🔄 Updating Youbot at $(YOUBOT_HOME) ..."
	@$(MAKE) --no-print-directory _do_install FIRST_INSTALL=0
	@echo ""
	@echo "✅ Youbot updated!"
	@$(MAKE) --no-print-directory _post_install_info

# ─── Internal: shared install/update logic ──────────────────────────────────────

_do_install:
	@echo ""
	@echo "📦 $(if $(filter 1,$(FIRST_INSTALL)),Installing,Updating) Youbot at $(YOUBOT_HOME) ..."

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
	@mkdir -p $(YOUBOT_HOME)/lib
	@mkdir -p $(YOUBOT_HOME)/web
	@mkdir -p $(YOUBOT_HOME)/data
	@mkdir -p $(YOUBOT_HOME)/data/models
	@mkdir -p $(YOUBOT_HOME)/logs
	@mkdir -p $(YOUBOT_HOME)/sessions
	@mkdir -p $(YOUBOT_HOME)/creds

	@mkdir -p $(YOUBOT_HOME)/workspace
	@mkdir -p $(YOUBOT_HOME)/custom/modules
	@mkdir -p $(YOUBOT_HOME)/custom/staging
	@mkdir -p $(YOUBOT_HOME)/workspace/skills

	@# Copy default skills (only if skill dir doesn't already exist — respects user deletions)
	@if [ -d $(CORE_DIR)/skills ]; then \
		for skill_dir in $(CORE_DIR)/skills/*/; do \
			skill_name=$$(basename "$$skill_dir"); \
			if [ ! -d "$(YOUBOT_HOME)/workspace/skills/$$skill_name" ]; then \
				cp -r "$$skill_dir" "$(YOUBOT_HOME)/workspace/skills/$$skill_name"; \
			fi; \
		done; \
		echo "   Synced default skills to $(YOUBOT_HOME)/workspace/skills/"; \
	fi

	@# Copy default agents (e.g. Nexus orchestrator - respects user deletions)
	@mkdir -p $(YOUBOT_HOME)/workspace/agents
	@if [ -d $(CORE_DIR)/agents ]; then \
		for agent_file in $(CORE_DIR)/agents/*; do \
			if [ -f "$$agent_file" ]; then \
				agent_name=$$(basename "$$agent_file"); \
				if [ ! -e "$(YOUBOT_HOME)/workspace/agents/$$agent_name" ]; then \
					cp "$$agent_file" "$(YOUBOT_HOME)/workspace/agents/$$agent_name"; \
				fi; \
			fi; \
		done; \
		echo "   Synced default agents to $(YOUBOT_HOME)/workspace/agents/"; \
	fi


	@# ── Application code (replaced on every install/update) ────────────
	@# These are safe to replace — they contain only compiled code, not user data.

	@# Copy compiled backend (clean copy to avoid stale files)
	@rm -rf $(YOUBOT_HOME)/lib
	@cp -R $(CORE_DIR)/dist $(YOUBOT_HOME)/lib
	@echo "   Installed backend to $(YOUBOT_HOME)/lib/"

	@# Copy node_modules (needed at runtime)
	@mkdir -p $(YOUBOT_HOME)/node_modules
	@cp -R $(CORE_DIR)/node_modules/* $(YOUBOT_HOME)/node_modules/ 2>/dev/null || true
	@# Fix whisper addon platform naming (mac-arm64 → darwin-arm64)
	@if [ -f $(CORE_DIR)/scripts/fix-whisper-addon.sh ]; then \
		ADDON_DIR="$(YOUBOT_HOME)/node_modules/@kutalia/whisper-node-addon/dist"; \
		if [ -d "$$ADDON_DIR" ]; then \
			([ -d "$$ADDON_DIR/mac-arm64" ] && [ ! -e "$$ADDON_DIR/darwin-arm64" ] && ln -sf mac-arm64 "$$ADDON_DIR/darwin-arm64") || true; \
			([ -d "$$ADDON_DIR/mac-x64" ] && [ ! -e "$$ADDON_DIR/darwin-x64" ] && ln -sf mac-x64 "$$ADDON_DIR/darwin-x64") || true; \
		fi; \
	fi
	@# Rebuild native modules for the current Node.js version (prevents ERR_DLOPEN_FAILED)
	@cd $(YOUBOT_HOME) && npm rebuild 2>/dev/null || true
	@echo "   Installed dependencies to $(YOUBOT_HOME)/node_modules/"

	@# Copy static web UI (clean copy)
	@if [ -d $(WEB_DIR)/out ]; then \
		rm -rf $(YOUBOT_HOME)/web; \
		mkdir -p $(YOUBOT_HOME)/web; \
		cp -r $(WEB_DIR)/out/* $(YOUBOT_HOME)/web/; \
		echo "   Installed web UI to $(YOUBOT_HOME)/web/"; \
	else \
		echo "   ⚠️  No web export found (expected $(WEB_DIR)/out/)"; \
	fi

	@# ── Config (merge, never overwrite) ────────────────────────────────
	@if [ ! -f $(YOUBOT_HOME)/config.json ]; then \
		cp $(CLI_DIR)/default-config.json $(YOUBOT_HOME)/config.json; \
		echo "   Created default config at $(YOUBOT_HOME)/config.json"; \
	else \
		python3 $(CLI_DIR)/merge-config.py $(YOUBOT_HOME)/config.json $(CLI_DIR)/default-config.json; \
	fi

	@# ── Copy Migrations explicitly for Setup Wizard ───────────────
	@rm -rf $(YOUBOT_HOME)/migrations
	@cp -R $(CORE_DIR)/supabase/migrations $(YOUBOT_HOME)/migrations
	@echo "   Prepared auto-migration scripts in $(YOUBOT_HOME)/migrations/"

	@# ── Interactive Initialization Wizard (first install only) ──
	@if [ "$(FIRST_INSTALL)" = "1" ]; then \
		echo ""; \
		YOUBOT_HOME=$(YOUBOT_HOME) node $(YOUBOT_HOME)/lib/cli/wizard.js; \
		echo ""; \
	fi

	@# Install CLI to PATH
	@mkdir -p $(INSTALL_BIN_DIR)
	@cp $(CLI_DIR)/youbot $(INSTALL_BIN_DIR)/youbot
	@chmod +x $(INSTALL_BIN_DIR)/youbot
	@echo "   Installed CLI to $(INSTALL_BIN_DIR)/youbot"

	@# ── Write install marker ───────────────────────────────────────────
	@date -u +"%Y-%m-%dT%H:%M:%SZ" > "$(INSTALL_MARKER)"
	@echo "   Install marker written."

_post_install_info:
	@# ── Auto-restart if server is running ──────────────────────────────
	@if [ -f $(YOUBOT_HOME)/youbot.pid ] && kill -0 $$(cat $(YOUBOT_HOME)/youbot.pid) 2>/dev/null; then \
		echo ""; \
		echo "🔄 Server is running — restarting with new code..."; \
		$(INSTALL_BIN_DIR)/youbot restart; \
	else \
		echo ""; \
		echo "   Start with:   youbot start"; \
	fi
	@echo "   Dashboard:    http://localhost:11490"
	@echo "   Config:       $(YOUBOT_HOME)/config.json"

## uninstall: Remove youbot CLI (keeps data)
uninstall:
	@echo "🗑  Removing youbot CLI..."
	@rm -f $(INSTALL_BIN_DIR)/youbot
	@echo "   Removed CLI from $(INSTALL_BIN_DIR)/youbot"
	@echo ""
	@echo "   Note: Data is preserved at $(YOUBOT_HOME)/"
	@echo "   To remove everything: make uninstall-all"

## uninstall-all: Remove youbot CLI and all data
uninstall-all: uninstall
	@echo "🗑  Removing all youbot data..."
	@rm -rf $(YOUBOT_HOME)
	@echo "   Removed $(YOUBOT_HOME)/"

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
	@echo "🤖 Youbot Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
	@echo ""
	@echo "Variables:"
	@echo "  YOUBOT_HOME        Runtime directory (default: ~/.youbot)"
	@echo "  INSTALL_BIN_DIR   CLI install directory (default: ~/.local/bin)"
