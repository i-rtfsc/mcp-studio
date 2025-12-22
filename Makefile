.PHONY: help install kill dev build clean status
.DEFAULT_GOAL := help

DESKTOP_DIR := apps/desktop

help:
	@echo "======================================"
	@echo "  Tauri 2 + React Template"
	@echo "======================================"
	@echo "Commands:"
	@echo "  make install   - Install dependencies"
	@echo "  make kill      - Kill all running processes"
	@echo "  make dev     - Start development"
	@echo "  make build   - Build production"
	@echo "  make clean   - Deep clean (dist/target/node_modules)"
	@echo "  make status  - Show versions"

install:
	@echo "📦 Installing dependencies..."
	cd $(DESKTOP_DIR) && npm install --legacy-peer-deps
	@echo "✅ Done!"


# 杀掉所有进程
kill:
	@echo "🧹 清理所有进程和端口..."
	@pkill -f "tauri dev" 2>/dev/null || true
	@pkill -f "neuradock" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true
	@pkill -f "npm run tauri" 2>/dev/null || true
	@sleep 1
	@lsof -ti:1420 | xargs kill -9 2>/dev/null || true
	@lsof -ti:5173 | xargs kill -9 2>/dev/null || true
	@echo "✅ 进程清理完成"

dev: install kill
	@echo "🚀 Starting development..."
	cd $(DESKTOP_DIR) && npm run tauri:dev

build: install
	@echo "📦 Building..."
	cd $(DESKTOP_DIR) && npm run tauri:build

clean:
	@echo "🧹 Cleaning project (dist, target, node_modules, lock files)..."
	rm -rf $(DESKTOP_DIR)/dist $(DESKTOP_DIR)/src-tauri/target
	find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name "package-lock.json" -type f -delete 2>/dev/null || true
	@echo "✅ Clean complete"

status:
	@echo "📊 Project Status"
	@echo "Node: $$(node --version)"
	@echo "Rust: $$(rustc --version)"
	@echo "npm:  $$(npm --version)"
