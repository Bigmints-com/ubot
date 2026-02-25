.PHONY: all build build-backend build-web install uninstall clean dev help

# ─── Shell & PATH (ensure nvm-managed node/npm is found) ────────────────────
SHELL := /bin/zsh
export PATH := $(HOME)/.nvm/versions/node/v22.22.0/bin:$(HOME)/.local/bin:$(PATH)

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

	@# Create directory structure
	@mkdir -p $(UBOT_HOME)/lib
	@mkdir -p $(UBOT_HOME)/web
	@mkdir -p $(UBOT_HOME)/data
	@mkdir -p $(UBOT_HOME)/logs
	@mkdir -p $(UBOT_HOME)/sessions
	@mkdir -p $(UBOT_HOME)/creds
	@mkdir -p $(UBOT_HOME)/browser-profile

	@# Copy compiled backend (clean copy to avoid stale files)
	@rm -rf $(UBOT_HOME)/lib
	@cp -R $(CORE_DIR)/dist $(UBOT_HOME)/lib
	@echo "   Installed backend to $(UBOT_HOME)/lib/"

	@# Copy node_modules (needed at runtime)
	@mkdir -p $(UBOT_HOME)/node_modules
	@cp -R $(CORE_DIR)/node_modules/* $(UBOT_HOME)/node_modules/ 2>/dev/null || true
	@echo "   Installed dependencies to $(UBOT_HOME)/node_modules/"

	@# Copy static web UI
	@if [ -d $(WEB_DIR)/out ]; then \
		cp -r $(WEB_DIR)/out/* $(UBOT_HOME)/web/; \
		echo "   Installed web UI to $(UBOT_HOME)/web/"; \
	else \
		echo "   ⚠️  No web export found (expected $(WEB_DIR)/out/)"; \
	fi

	@# Copy public assets for backend static serving
	@cp -r $(CORE_DIR)/public $(UBOT_HOME)/public 2>/dev/null || true

	@# Create default config if none exists
	@if [ ! -f $(UBOT_HOME)/config.json ]; then \
		cp $(CLI_DIR)/default-config.json $(UBOT_HOME)/config.json; \
		echo "   Created default config at $(UBOT_HOME)/config.json"; \
	else \
		echo "   Config already exists, skipping."; \
	fi

	@# Install CLI to PATH
	@mkdir -p $(INSTALL_BIN_DIR)
	@cp $(CLI_DIR)/ubot $(INSTALL_BIN_DIR)/ubot
	@chmod +x $(INSTALL_BIN_DIR)/ubot
	@echo "   Installed CLI to $(INSTALL_BIN_DIR)/ubot"

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
