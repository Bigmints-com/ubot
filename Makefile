.PHONY: all build build-backend build-web install uninstall clean dev help

# ─── Shell & PATH (ensure nvm-managed node/npm is found) ────────────────────
SHELL := /bin/bash
# Dynamically find the nvm-managed node directory (works across versions & platforms)
NVM_NODE_DIR := $(shell ls -d $(HOME)/.nvm/versions/node/v22.*/bin 2>/dev/null | tail -1)
export PATH := $(NVM_NODE_DIR):$(HOME)/.local/bin:$(PATH)

# ─── Variables ──────────────────────────────────────────────────────────────────
UBOT_HOME ?= $(HOME)/.ubot
INSTALL_BIN_DIR ?= $(HOME)/.local/bin
CORE_DIR = ubot-core
WEB_DIR = $(CORE_DIR)/web
CLI_DIR = cli

# ─── Default ────────────────────────────────────────────────────────────────────
all: build

## build: Build everything (backend + web UI)
build: build-backend build-web
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

## install: Install ubot to ~/.ubot and CLI to ~/.local/bin
install: build
	@echo ""
	@echo "📦 Installing Ubot to $(UBOT_HOME) ..."

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
	@mkdir -p $(UBOT_HOME)/logs
	@mkdir -p $(UBOT_HOME)/sessions
	@mkdir -p $(UBOT_HOME)/creds
	@mkdir -p $(UBOT_HOME)/browser-profile
	@mkdir -p $(UBOT_HOME)/workspace
	@mkdir -p $(UBOT_HOME)/custom/modules
	@mkdir -p $(UBOT_HOME)/custom/staging
	@mkdir -p $(UBOT_HOME)/skills

	@# Copy default skills (only if skill dir doesn't already exist — respects user deletions)
	@if [ -d $(CORE_DIR)/default-skills ]; then \
		for skill_dir in $(CORE_DIR)/default-skills/*/; do \
			skill_name=$$(basename "$$skill_dir"); \
			if [ ! -d "$(UBOT_HOME)/skills/$$skill_name" ]; then \
				cp -r "$$skill_dir" "$(UBOT_HOME)/skills/$$skill_name"; \
			fi; \
		done; \
		echo "   Synced default skills to $(UBOT_HOME)/skills/"; \
	fi

	@# ── Backup database before install ─────────────────────────────────
	@if [ -f $(UBOT_HOME)/data/ubot.db ]; then \
		cp $(UBOT_HOME)/data/ubot.db $(UBOT_HOME)/data/ubot.db.bak; \
		echo "   Backed up database to data/ubot.db.bak"; \
	fi

	@# ── Application code (replaced on every install) ───────────────────
	@# These are safe to replace — they contain only compiled code, not user data.

	@# Copy compiled backend (clean copy to avoid stale files)
	@rm -rf $(UBOT_HOME)/lib
	@cp -R $(CORE_DIR)/dist $(UBOT_HOME)/lib
	@echo "   Installed backend to $(UBOT_HOME)/lib/"

	@# Copy node_modules (needed at runtime)
	@mkdir -p $(UBOT_HOME)/node_modules
	@cp -R $(CORE_DIR)/node_modules/* $(UBOT_HOME)/node_modules/ 2>/dev/null || true
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

	@# Copy public assets for backend static serving
	@cp -r $(CORE_DIR)/public $(UBOT_HOME)/public 2>/dev/null || true

	@# ── Config (merge, never overwrite) ────────────────────────────────
	@if [ ! -f $(UBOT_HOME)/config.json ]; then \
		cp $(CLI_DIR)/default-config.json $(UBOT_HOME)/config.json; \
		echo "   Created default config at $(UBOT_HOME)/config.json"; \
	else \
		python3 $(CLI_DIR)/merge-config.py $(UBOT_HOME)/config.json $(CLI_DIR)/default-config.json; \
	fi

	@# Install CLI to PATH
	@mkdir -p $(INSTALL_BIN_DIR)
	@cp $(CLI_DIR)/ubot $(INSTALL_BIN_DIR)/ubot
	@chmod +x $(INSTALL_BIN_DIR)/ubot
	@echo "   Installed CLI to $(INSTALL_BIN_DIR)/ubot"

	@# ── Post-install: Check macOS permissions ────────────────
	@echo ""
	@if [ "$$(uname)" = "Darwin" ]; then \
		FDA_OK=true; \
		if ! sqlite3 "$$HOME/Library/Messages/chat.db" "SELECT 1" >/dev/null 2>&1; then \
			FDA_OK=false; \
		fi; \
		if [ "$$FDA_OK" = "false" ]; then \
			echo "⚠️  Full Disk Access not granted."; \
			echo "   Some features (iMessage, Safari history, etc.) need this permission."; \
			echo "   To grant it:"; \
			echo "     1. System Settings → Privacy & Security → Full Disk Access"; \
			echo "     2. Add your Terminal app (Terminal.app, iTerm2, Warp, etc.)"; \
			echo "     3. Add Node.js: $$(which node)"; \
			echo ""; \
			printf "   Open System Settings now? [y/N] "; \
			read -r ans; \
			if [ "$$ans" = "y" ] || [ "$$ans" = "Y" ]; then \
				open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"; \
			fi; \
		else \
			echo "✅ Full Disk Access: granted"; \
		fi; \
	fi

	@echo ""
	@echo "✅ Ubot installed!"
	@echo ""
	@echo "   Get started:  ubot start"
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
