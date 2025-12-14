# Changelog

All notable changes are documented here.

## [0.1.0] - 2025-12-10

### Added
- Initial Tauri 2 + React template release
- Monorepo workspace with `apps/desktop` + shared packages stubs
- Domain/Application/Infrastructure/Interface layers with config & user aggregates
- SQLite migrations (`users`, `system_settings`) and connection pool bootstrap
- Tauri commands for greet, config CRUD, user CRUD, DB health, logging, log-folder opening
- Event publisher that relays `DomainEvent::ConfigChanged` to the front end
- Comprehensive logging pipeline (console + rolling file) and frontend log bridge
- React application with MainLayout, Sidebar, TopBar, PageContainer, Component showcase
- Sample pages: dashboard-style Home, Settings (with log/DB utilities), Users (table + dialog)
- shadcn/ui component set (accordion, alert, avatar, badge, button, card, checkbox, dialog, dropdown menu, form, input, label, progress, select, skeleton, tabs, textarea, tooltip, etc.)
- Theme toggle, i18n switcher, zh-CN & en-US dictionaries wired through i18next
- TanStack Query `useUsers` hook (list/create/delete) and toast-driven UX
- Makefile helpers (`install`, `dev`, `build`, `clean`, `status`) + npm scripts bridging to Tauri CLI
- Documentation set: dual-language README, Getting Started, Architecture Overview, Development Guides, Template Checklist, Project Summary, Changelog, Contributing Guide, Code of Conduct
- Icon resources guide and assets placeholder

### Notes
- API documentation and tutorials directories are reserved for future releases
- Automated tests/CI are not yet included; use `npm run build` + `cargo check` for validation
