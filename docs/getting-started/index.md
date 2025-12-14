# 快速开始

本指南帮助你快速搭建开发环境并运行 MCP Studio。

## 什么是 MCP Studio？

MCP Studio 是一个专业的 MCP (Model Context Protocol) 客户端调试工具，用于：
- 连接和管理 MCP 服务器
- 调试 MCP 工具调用
- 监控通信过程
- 保存和分析调用历史

## 环境要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 20 | 推荐使用 LTS 版本 |
| Rust | >= 1.70 | 通过 rustup 安装 |
| npm | >= 10 | Node.js 自带 |

### 平台依赖

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows:**
- 安装 [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- 安装 Visual C++ Redistributable

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/your-username/mcp-studio.git
cd mcp-studio
```

### 2. 安装依赖

```bash
make install
```

或者手动安装：

```bash
npm install
cd apps/desktop && npm install --legacy-peer-deps
```

### 3. 启动开发模式

```bash
make dev
```

启动后会自动：
1. 启动 Vite 开发服务器 (React 前端)
2. 编译 Rust 后端
3. 打开 MCP Studio 桌面窗口

前端支持热重载，修改代码后自动刷新。

### 4. 构建发布版本

```bash
make build
```

构建产物位于：
- macOS: `apps/desktop/src-tauri/target/release/bundle/macos/`
- Windows: `apps/desktop/src-tauri/target/release/bundle/msi/`
- Linux: `apps/desktop/src-tauri/target/release/bundle/appimage/`

## 项目结构概览

```
apps/desktop/
├── src/                          # React 前端
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 基础组件 (40+)
│   │   ├── studio/               # MCP Studio 核心组件
│   │   │   ├── StudioLayout.tsx  # 主界面布局
│   │   │   ├── ServerDock.tsx    # 服务器管理面板
│   │   │   ├── ToolList.tsx      # 工具列表
│   │   │   ├── ToolDetail.tsx    # 工具详情
│   │   │   ├── Workspace.tsx     # 工作区
│   │   │   └── Inspector.tsx     # 检查器
│   │   └── LanguageSwitcher.tsx  # 语言切换
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useMcpServers.ts      # MCP 服务器管理
│   │   └── useMcpTools.ts        # MCP 工具管理
│   ├── lib/                      # 工具函数
│   │   ├── query-client.ts       # TanStack Query 配置
│   │   ├── logger.ts             # 日志工具
│   │   └── events.ts             # 事件类型定义
│   └── main.tsx                  # 应用入口
│
└── src-tauri/                    # Rust 后端
    ├── src/
    │   ├── domain/               # 领域层
    │   │   ├── cqrs.rs           # CQRS 核心 traits
    │   │   ├── mcp.rs            # MCP 核心领域模型
    │   │   ├── config.rs         # 配置管理
    │   │   └── events.rs         # 领域事件
    │   ├── application/          # 应用层
    │   │   ├── mcp_commands.rs   # MCP 命令处理器
    │   │   ├── mcp_queries.rs    # MCP 查询处理器
    │   │   └── config_commands.rs
    │   ├── infra/                # 基础设施层
    │   │   ├── mcp_client.rs     # MCP 客户端管理器
    │   │   ├── sse_transport.rs  # SSE 传输实现
    │   │   ├── repo_mcp.rs       # MCP 仓储实现
    │   │   ├── http.rs           # HTTP 客户端
    │   │   └── db.rs             # 数据库初始化
    │   └── interface/            # 接口层
    │       └── commands.rs       # Tauri 命令
    └── migrations/               # 数据库迁移
```

## 核心功能

### 1. MCP 服务器管理
- 支持多种传输协议：SSE、Streamable HTTP、Stdio
- 实时连接状态监控
- 自动重连机制
- 服务器配置管理

### 2. 工具调试
- 自动获取服务器工具列表
- 显示工具的输入输出 Schema
- 动态生成参数表单
- 实时调用并查看结果

### 3. 数据模型

主要数据实体：
- **McpServer**：服务器配置和状态
- **McpTool**：工具信息（内存缓存，不持久化）
- **McpCallHistory**：调用历史记录
- **HttpReceivedMessage**：HTTP 接收的消息

## 数据流示例

以「连接 MCP 服务器并调用工具」为例：

```
1. React: useMcpServers().connectServer(serverId)
                     ↓
2. Tauri: invoke('connect_mcp_server', { id: serverId })
                     ↓
3. Rust Interface: commands::connect_mcp_server(handler, id)
                     ↓
4. Application: McpCommandHandler.handle(ConnectMcpServerCmd)
                     ↓
5. Infrastructure: McpClientManager.connect()
                     ↓
6. Frontend: 实时更新连接状态，获取工具列表
```

## 常用命令

```bash
make install    # 安装依赖
make dev        # 开发模式
make build      # 构建发布
make clean      # 清理构建
make status     # 检查环境
make kill       # 杀死所有进程
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| npm 依赖安装失败 | 使用 `npm install --legacy-peer-deps` |
| Rust 编译失败 | 确保已安装 Rust 工具链，运行 `rustup update` |
| macOS 窗口无法打开 | 在系统偏好设置中授权应用 |
| MCP 服务器连接失败 | 检查服务器 URL 和传输类型配置 |
| 工具列表为空 | 确保服务器已连接并支持 tools/list 协议 |

## 下一步

- [架构设计](./architecture/architecture_overview.md) - 深入理解 DDD + CQRS 在 MCP Studio 中的应用
- [开发指南](./zh/development.md) - 学习如何扩展 MCP Studio 功能
