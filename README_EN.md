# MCP Studio

[简体中文](./README.md) | English

A professional MCP (Model Context Protocol) client debugging tool built with **Tauri 2 + Rust + React**, featuring **DDD + CQRS** architecture and support for multiple transport protocols.

## What is MCP?

MCP (Model Context Protocol) is an open protocol for connecting AI applications with data sources. It provides a standardized way to expose tools, resources, and prompts to AI assistants.

## What is MCP Studio?

MCP Studio is a professional MCP client debugging tool that helps developers:

- 🔗 **Connect and Manage MCP Servers** - Support for SSE, Streamable HTTP, and Stdio transport protocols
- 🛠️ **Debug MCP Tools** - View available tools, inspect input/output schemas, test calls in real-time
- 📊 **Monitor Communication** - Complete request/response logging for troubleshooting
- 💾 **History Management** - Save call history with retry and analysis capabilities
- 🎯 **Real-time Status** - Live connection status monitoring with auto-reconnection

## Core Features

### MCP Server Management
- Add, edit, and delete MCP server configurations
- Support for SSE (Server-Sent Events) transport protocol
- Support for Streamable HTTP transport protocol
- Support for Stdio (Standard Input/Output) transport protocol
- Real-time connection status monitoring with heartbeat detection
- Automatic reconnection on connection loss

### Tool Debugging System
- Automatically fetch tools list from connected servers
- Display detailed input/output schemas for each tool
- Dynamic form generation based on JSON schemas
- Real-time tool invocation with result visualization
- JSON Schema validation support

### Communication Monitoring
- Complete logging of all MCP calls and responses
- Display raw request and response data
- Record execution time and error information
- Support for data filtering and search

### Advanced Features
- **DDD + CQRS Architecture** - Clean code structure for maintainability
- **Multi-protocol Support** - Compatible with different MCP protocol versions
- **Real-time Events** - Instant notification of connection status changes
- **Data Persistence** - SQLite local storage with history queries
- **Cross-platform** - Full coverage of macOS, Windows, and Linux

## Quick Start

### Prerequisites

- Node.js >= 20
- Rust >= 1.70
- Platform dependencies:
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`
  - Windows: WebView2 Runtime

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/tauri2-react-template.git
cd tauri2-react-template

# Install dependencies
make install

# Start development mode
make dev

# Build for production
make build
```

## Project Structure

```
mcp-studio/
├── apps/desktop/
│   ├── src/                          # React Frontend
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui base component library (40+)
│   │   │   ├── studio/               # MCP Studio core components
│   │   │   │   ├── StudioLayout.tsx  # Main UI layout
│   │   │   │   ├── ServerDock.tsx    # Server management panel
│   │   │   │   ├── ToolList.tsx      # Tool listing
│   │   │   │   ├── ToolDetail.tsx    # Tool details view
│   │   │   │   ├── Workspace.tsx     # Working area
│   │   │   │   └── Inspector.tsx     # Inspector panel
│   │   │   └── LanguageSwitcher.tsx  # Language switcher
│   │   ├── hooks/                    # Custom Hooks
│   │   │   ├── useMcpServers.ts      # MCP server management
│   │   │   └── useMcpTools.ts        # MCP tool management
│   │   ├── lib/                      # Utilities
│   │   │   ├── query-client.ts       # TanStack Query config
│   │   │   ├── logger.ts             # Logging utilities
│   │   │   └── events.ts             # Event type definitions
│   │   └── main.tsx                  # App entry point
│   │
│   └── src-tauri/                    # Rust Backend (DDD + CQRS)
│       ├── src/
│       │   ├── domain/               # Domain Layer
│       │   │   ├── cqrs.rs           # CQRS core traits
│       │   │   ├── mcp.rs            # MCP core domain models
│       │   │   ├── config.rs         # Configuration management
│       │   │   └── events.rs         # Domain events
│       │   ├── application/          # Application Layer (Handlers)
│       │   │   ├── mcp_commands.rs   # MCP command handlers
│       │   │   ├── mcp_queries.rs    # MCP query handlers
│       │   │   └── config_commands.rs
│       │   ├── infra/                # Infrastructure Layer
│       │   │   ├── mcp_client.rs     # MCP client manager
│       │   │   ├── sse_transport.rs  # SSE transport implementation
│       │   │   ├── repo_mcp.rs       # MCP repository implementation
│       │   │   ├── http.rs           # HTTP client
│       │   │   └── db.rs             # Database initialization
│       │   ├── interface/            # Interface Layer
│       │   │   ├── commands.rs       # Tauri commands
│       │   │   └── tray.rs           # System tray
│       │   └── main.rs               # Application entry
│       └── migrations/               # Database migrations
│           └── 20250101000000_init.sql
│
├── docs/                             # Documentation
└── Makefile                          # Common commands
```

## Architecture

### DDD Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Layer                          │
│              (Tauri Commands, System Tray)                  │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer                         │
│           (CommandHandlers, QueryHandlers)                  │
├─────────────────────────────────────────────────────────────┤
│                     Domain Layer                            │
│    (Entities, Commands, Queries, Repository Traits)         │
├─────────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                       │
│      (SQLite Repositories, HTTP Client, Logging)            │
└─────────────────────────────────────────────────────────────┘
```

### CQRS Pattern

This template implements a complete CQRS pattern:

```rust
// Commands (write operations)
pub struct CreateUserCmd { ... }
impl Command for CreateUserCmd {}

// Queries (read operations)
pub struct ListUsersQuery;
impl Query for ListUsersQuery {}

// Command Handler
impl CommandHandler<CreateUserCmd, User> for UserCommandHandler { ... }

// Query Handler
impl QueryHandler<ListUsersQuery, Vec<User>> for UserQueryHandler { ... }
```

### Data Flow

```
┌──────────┐    invoke()    ┌───────────┐    handle()    ┌─────────────┐
│  React   │ ─────────────> │  Tauri    │ ─────────────> │  Command/   │
│  Frontend│                │  Command  │                │  Query      │
└──────────┘                └───────────┘                │  Handler    │
     ^                                                   └──────┬──────┘
     │                                                          │
     │                                                          v
     │         Event                                    ┌───────────────┐
     └──────────────────────────────────────────────────│  Repository   │
                                                        │  (SQLite)     │
                                                        └───────────────┘
```

## Frontend Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool |
| TanStack Query | Server State Management |
| Zustand | Client State Management |
| React Router | Routing |
| shadcn/ui | UI Component Library |
| Tailwind CSS | Styling |
| i18next | Internationalization |
| React Hook Form + Zod | Form Validation |

## Backend Stack

| Technology | Purpose |
|------------|---------|
| Rust | Systems Programming Language |
| Tauri 2 | Desktop Application Framework |
| SQLx | Async Database Operations |
| SQLite | Local Database |
| Tokio | Async Runtime |
| Serde | Serialization |
| Tracing | Logging |

## Commands

```bash
make install    # Install dependencies
make dev        # Start development mode
make build      # Build for production
make clean      # Clean build artifacts
make status     # Check environment status
```

## Documentation

- [Getting Started](./docs/getting_started.md)
- [Architecture](./docs/architecture/architecture_overview.md)
- [Development Guide](./docs/en/development.md)
- [Changelog](./docs/changelog.md)

## License

[MIT License](./LICENSE)
