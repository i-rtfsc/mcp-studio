# Documentation Center

English | [简体中文](../README.md)

Welcome to the **MCP Studio** documentation center. MCP Studio is a professional MCP (Model Context Protocol) client debugging tool.

## Documentation Navigation

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started/) | Environment setup, installation, build and release |
| [Architecture](./architecture/) | DDD + CQRS architecture details |
| [Development Guide](./development.md) | Daily development, feature addition, debugging tips |
| [Changelog](./changelog.md) | Version update records |

## Recommended Reading Order

1. **[Getting Started](./getting-started/)** - Set up development environment and run the project
2. **[Architecture](./architecture/)** - Understand DDD + CQRS architecture
3. **[Development Guide](./development.md)** - Learn how to extend functionality

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 React Frontend (TypeScript)                 │
│         shadcn/ui · TanStack Query · i18next                │
├─────────────────────────────────────────────────────────────┤
│                    Tauri IPC Bridge                         │
├─────────────────────────────────────────────────────────────┤
│                  Rust Backend (DDD + CQRS)                  │
│  ┌──────────────┬───────────────┬───────────────────────┐   │
│  │  Interface   │  Application  │    Infrastructure     │   │
│  │  (Commands)  │  (Handlers)   │    (Repositories)     │   │
│  └──────────────┴───────────────┴───────────────────────┘   │
│                        Domain Layer                         │
│            (Entities · Commands · Queries · Events)         │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite build tool
- shadcn/ui (40+ components)
- TanStack Query + Zustand
- i18next multi-language

### Backend
- Rust + Tauri 2
- SQLx + SQLite
- DDD + CQRS architecture
- Tracing logging

## Quick Commands

```bash
make install    # Install dependencies
make dev        # Development mode
make build      # Production build
make clean      # Clean
```
