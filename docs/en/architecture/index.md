# MCP Studio Architecture Design

This document details the DDD + CQRS architecture design of MCP Studio and MCP protocol-related implementations.

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  MCP Studio UI Components                   ││
│  │  StudioLayout │ ServerDock │ ToolList │ ToolDetail          ││
│  │  Workspace    │ Inspector  │ Settings │ AddEditServerDialog ││
│  │                                                             ││
│  │  Custom Hooks                                               ││
│  │  useMcpServers│ useMcpTools│ useTheme                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                            │                                    │
│                     invoke() / listen()                         │
├─────────────────────────────────────────────────────────────────┤
│                        Tauri IPC                                │
├─────────────────────────────────────────────────────────────────┤
│                        Rust Backend                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Interface Layer                          ││
│  │  commands.rs:                                               ││
│  │  - create_mcp_server, list_mcp_servers                      ││
│  │  - connect_mcp_server, disconnect_mcp_server                ││
│  │  - call_mcp_tool, refresh_mcp_tools                         ││
│  │  tray.rs: System tray menu                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                            │                                    │
│                     CommandHandler / QueryHandler               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Application Layer                       │  │
│  │  McpCommandHandler: handle MCP commands                   │  │
│  │    - ConnectMcpServerCmd -> McpServer                     │  │
│  │    - CallMcpToolCmd -> McpToolCallResult                  │  │
│  │  McpQueryHandler: handle MCP queries                      │  │
│  │    - ListMcpServersQuery -> Vec<McpServer>                │  │
│  │    - GetMcpToolsQuery -> Vec<McpTool>                     │  │
│  │  ConfigCommandHandler: handle configuration               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                     Repository Traits                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Domain Layer                          │  │
│  │  cqrs.rs: Command, Query, CommandHandler, QueryHandler    │  │
│  │  mcp.rs:                                                  │  │
│  │    - McpServer, McpTool, McpCallHistory                   │  │
│  │    - CreateMcpServerCmd, CallMcpToolCmd                   │  │
│  │    - IMcpServerRepository, IMcpCallHistoryRepository      │  │
│  │  config.rs: App configuration management                  │  │
│  │  events.rs: DomainEvent, IEventPublisher                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                     implements traits                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 Infrastructure Layer                      │  │
│  │  mcp_client.rs: McpClientManager                          │  │
│  │    - Manages MCP connections                              │  │
│  │    - Handles multiple transport types                     │  │
│  │  sse_transport.rs: SSE transport implementation           │  │
│  │  repo_mcp.rs: SqliteMcpRepository implementations         │  │
│  │  repo_config.rs: Configuration repository                 │  │
│  │  event_publisher.rs: TauriEventPublisher                  │  │
│  │  db.rs: Database init & migrations                        │  │
│  │  logging.rs: Tracing setup                                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## DDD 四层架构

### 1. Domain Layer (领域层)

领域层是架构的核心，包含 MCP 相关的业务逻辑概念，不依赖任何外部框架。

**文件位置:** `src-tauri/src/domain/`

#### CQRS 核心 Traits (`cqrs.rs`)

```rust
/// 命令标记 trait - 表示写操作
pub trait Command: Send + Sync {}

/// 查询标记 trait - 表示读操作
pub trait Query: Send + Sync {}

/// 命令处理器 - 处理写操作
#[async_trait]
pub trait CommandHandler<C: Command, R = ()>: Send + Sync {
    async fn handle(&self, cmd: C) -> Result<R, AppError>;
}

/// 查询处理器 - 处理读操作
#[async_trait]
pub trait QueryHandler<Q: Query, R>: Send + Sync {
    async fn handle(&self, query: Q) -> Result<R, AppError>;
}
```

#### MCP 领域模型 (`mcp.rs`)

```rust
// MCP 服务器实体
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub url: String,
    pub server_type: McpServerType,  // sse, stdio, streamable_http
    pub status: McpServerStatus,     // connected, disconnected, connecting, error
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// MCP 工具实体（仅在内存缓存）
pub struct McpTool {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
    pub created_at: String,
}

// MCP 调用历史
pub struct McpCallHistory {
    pub id: String,
    pub server_id: String,
    pub tool_name: String,
    pub input_params: Option<String>,
    pub output_result: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

// 命令示例
pub struct CreateMcpServerCmd {
    pub name: String,
    pub url: String,
    pub server_type: McpServerType,
}

pub struct CallMcpToolCmd {
    pub server_id: String,
    pub tool_name: String,
    pub params: Option<serde_json::Value>,
}

impl Command for CreateMcpServerCmd {}
impl Command for CallMcpToolCmd {}

// 查询
pub struct ListMcpServersQuery;
pub struct GetMcpToolsQuery { pub server_id: String }

impl Query for ListMcpServersQuery {}
impl Query for GetMcpToolsQuery {}

// 仓储接口
#[async_trait]
pub trait IMcpServerRepository: Send + Sync {
    async fn create(&self, server: McpServer) -> Result<McpServer, AppError>;
    async fn update(&self, server: McpServer) -> Result<McpServer, AppError>;
    async fn delete(&self, id: &str) -> Result<(), AppError>;
    async fn list(&self) -> Result<Vec<McpServer>, AppError>;
}
```

#### 领域事件 (`events.rs`)

```rust
#[derive(Debug, Serialize, Clone)]
pub enum DomainEvent {
    McpServerConnected { server_id: String },
    McpServerDisconnected { server_id: String, error: Option<String> },
    McpToolCalled { server_id: String, tool_name: String, success: bool },
}

#[async_trait]
pub trait IEventPublisher: Send + Sync {
    fn publish(&self, event: DomainEvent);
}
```

### 2. Application Layer (应用层)

应用层实现 CQRS 的 CommandHandler 和 QueryHandler，编排 MCP 相关的业务流程。

**文件位置:** `src-tauri/src/application/`

#### MCP 命令处理器 (`mcp_commands.rs`)

```rust
pub struct McpCommandHandler {
    mcp_repo: Arc<dyn IMcpServerRepository>,
    history_repo: Arc<dyn IMcpCallHistoryRepository>,
    mcp_client: Arc<McpClientManager>,
}

#[async_trait]
impl CommandHandler<ConnectMcpServerCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: ConnectMcpServerCmd) -> Result<McpServer, AppError> {
        // 1. 获取服务器配置
        let mut server = self.mcp_repo.find_by_id(&cmd.id).await?
            .ok_or(AppError::Domain("Server not found".to_string()))?;

        // 2. 通过 MCP 客户端连接
        self.mcp_client.connect(&server.id, &server.url, &server.server_type.to_string()).await?;

        // 3. 更新服务器状态
        server.status = McpServerStatus::Connected;
        server.updated_at = chrono::Utc::now().to_rfc3339();

        self.mcp_repo.update(server).await
    }
}

#[async_trait]
impl CommandHandler<CallMcpToolCmd, McpToolCallResult> for McpCommandHandler {
    async fn handle(&self, cmd: CallMcpToolCmd) -> Result<McpToolCallResult, AppError> {
        // 1. 调用 MCP 工具
        let result = self.mcp_client.call_tool(&cmd.server_id, &cmd.tool_name, cmd.params).await?;

        // 2. 记录调用历史
        let history = McpCallHistory {
            id: Uuid::new_v4().to_string(),
            server_id: cmd.server_id.clone(),
            tool_name: cmd.tool_name.clone(),
            input_params: cmd.params.map(|p| p.to_string()),
            output_result: Some(result.raw_response.clone()),
            status: if result.success { "success" } else { "error" },
            error_message: result.error.clone(),
            duration_ms: Some(result.duration_ms),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        self.history_repo.create(history).await?;

        Ok(result)
    }
}
```

#### MCP 查询处理器 (`mcp_queries.rs`)

```rust
pub struct McpQueryHandler {
    mcp_repo: Arc<dyn IMcpServerRepository>,
    history_repo: Arc<dyn IMcpCallHistoryRepository>,
}

#[async_trait]
impl QueryHandler<ListMcpServersQuery, Vec<McpServer>> for McpQueryHandler {
    async fn handle(&self, _query: ListMcpServersQuery) -> Result<Vec<McpServer>, AppError> {
        self.mcp_repo.list().await
    }
}

#[async_trait]
impl QueryHandler<GetMcpToolsQuery, Vec<McpTool>> for McpQueryHandler {
    async fn handle(&self, query: GetMcpToolsQuery) -> Result<Vec<McpTool>, AppError> {
        // 工具列表从内存缓存获取，不存储在数据库
        let mcp_client = self.mcp_client_manager.lock().await;

        if let Some(tools) = mcp_client.get_cached_tools(&query.server_id) {
            Ok(tools.into_iter().map(|t| McpTool {
                id: Uuid::new_v4().to_string(),
                server_id: query.server_id.clone(),
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
                output_schema: t.output_schema,
                created_at: chrono::Utc::now().to_rfc3339(),
            }).collect())
        } else {
            Ok(vec![])
        }
    }
}
```

### 3. Infrastructure Layer (基础设施层)

基础设施层实现领域层定义的接口，处理 MCP 协议和外部依赖。

**文件位置:** `src-tauri/src/infra/`

#### MCP 客户端管理器 (`mcp_client.rs`)

MCP 客户端管理器是基础设施层的核心组件，负责：
- 管理多个 MCP 服务器连接
- 支持多种传输协议（SSE、Streamable HTTP）
- 缓存工具列表（内存中，不持久化）
- 心跳检测和自动重连
- 处理协议级别的通信

```rust
pub struct McpClientManager {
    connections: Arc<RwLock<HashMap<String, McpConnection>>>,
    tools_cache: Arc<RwLock<HashMap<String, Vec<McpToolInfo>>>>,
    event_publisher: Arc<dyn EventPublisher>,
}
```

#### SSE 传输实现 (`sse_transport.rs`)

实现了 MCP 协议的 Server-Sent Events 传输方式：
- 监听 `/sse` 端点接收消息
- 通过 POST 请求发送命令
- 自动处理连接断开和重连

```rust
pub struct SseWorker {
    url: String,
    server_id: String,
    disconnect_callback: Option<DisconnectCallback>,
}
```

#### SQLite 仓储实现 (`repo_mcp.rs`)

```rust
pub struct SqliteMcpServerRepository {
    pool: SqlitePool,
}

#[async_trait]
impl IMcpServerRepository for SqliteMcpServerRepository {
    async fn create(&self, server: McpServer) -> Result<McpServer, AppError> {
        sqlx::query("INSERT INTO mcp_servers ...")
            .bind(&server.id)
            .bind(&server.name)
            .execute(&self.pool)
            .await?;
        Ok(server)
    }

    async fn list(&self) -> Result<Vec<McpServer>, AppError> {
        sqlx::query_as::<_, McpServer>("SELECT * FROM mcp_servers ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await
            .map_err(Into::into)
    }
}
```

### 4. Interface Layer (接口层)

接口层暴露 Tauri 命令给前端，委托给应用层处理。

**文件位置:** `src-tauri/src/interface/`

```rust
#[tauri::command]
pub async fn create_mcp_server(
    handler: State<'_, McpCommandHandler>,
    cmd: CreateMcpServerCmd,
) -> Result<McpServer, AppError> {
    handler.handle(cmd).await
}

#[tauri::command]
pub async fn connect_mcp_server(
    handler: State<'_, McpCommandHandler>,
    id: String,
) -> Result<McpServer, AppError> {
    handler.handle(ConnectMcpServerCmd { id }).await
}

#[tauri::command]
pub async fn call_mcp_tool(
    handler: State<'_, McpCommandHandler>,
    cmd: CallMcpToolCmd,
) -> Result<McpToolCallResult, AppError> {
    handler.handle(cmd).await
}
```

## MCP 协议支持

### 支持的传输类型

1. **SSE (Server-Sent Events)**
   - 通过 `/sse` 端点建立连接
   - 适用于基于 HTTP 的 MCP 服务器
   - 支持实时双向通信

2. **Streamable HTTP**
   - 基于 HTTP 的流式通信
   - 使用 rmcp SDK 的 StreamableHttpClientTransport
   - 更现代的实现方式

3. **Stdio** (预留)
   - 通过标准输入输出通信
   - 适用于本地进程间通信
   - 计划在后续版本中实现

### 协议交互流程

```
1. 建立连接
   Client ──► initialize ──► Server
   Client ◄─── ready ◄─── Server

2. 获取工具列表
   Client ──► tools/list ──► Server
   Client ◄─── tools ◄─── Server

3. 调用工具
   Client ──► tools/call ──► Server
   Client ◄─── result ◄─── Server
```

## 依赖注入

在 `main.rs` 中完成依赖注入：

```rust
// 创建仓储
let mcp_repo = Arc::new(SqliteMcpServerRepository::new(pool.clone()));
let history_repo = Arc::new(SqliteMcpCallHistoryRepository::new(pool.clone()));
let config_repo = Arc::new(SqliteConfigRepository::new(pool.clone()));

// 创建事件发布器
let event_publisher: Arc<dyn IEventPublisher> = Arc::new(
    TauriEventPublisher::new(app_handle.clone())
);

// 创建 MCP 客户端管理器
let mcp_client = Arc::new(McpClientManager::new(event_publisher.clone()));
mcp_client.set_config_repo(config_repo.clone()).await;

// 创建 Handlers 并注入仓储
let mcp_cmd_handler = McpCommandHandler::new(
    mcp_repo.clone(),
    history_repo.clone(),
    mcp_client.clone(),
);
let mcp_query_handler = McpQueryHandler::new(
    mcp_repo.clone(),
    history_repo.clone(),
);

// 注册到 Tauri State
app_handle.manage(mcp_cmd_handler);
app_handle.manage(mcp_query_handler);
app_handle.manage(mcp_client);
```

## 数据流示例

### 连接 MCP 服务器流程

```
1. React: useMcpServers().connectServer(serverId)
         ↓
2. Tauri IPC: invoke('connect_mcp_server', { id: serverId })
         ↓
3. Interface: commands::connect_mcp_server(handler, id)
         ↓
4. Application: McpCommandHandler.handle(ConnectMcpServerCmd)
         ↓
5. Infrastructure: McpClientManager.connect()
    - 建立传输连接（SSE 或 Streamable HTTP）
    - 发送 initialize 请求
    - 等待 ready 响应
         ↓
6. Domain: 更新 McpServer 状态为 connected
         ↓
7. Infrastructure: Repository 保存状态
         ↓
8. Frontend: 接收状态更新，自动获取工具列表
```

### 调用 MCP 工具流程

```
1. React: useMcpTools().callTool(serverId, toolName, params)
         ↓
2. Tauri IPC: invoke('call_mcp_tool', { cmd })
         ↓
3. Interface: commands::call_mcp_tool(handler, cmd)
         ↓
4. Application: McpCommandHandler.handle(CallMcpToolCmd)
         ↓
5. Infrastructure: McpClientManager.call_tool()
    - 使用已建立的连接
    - 发送 tools/call 请求
    - 等待响应或超时
         ↓
6. Infrastructure: 记录调用历史
         ↓
7. Response: McpToolCallResult 返回到 React
```

## 架构优势

1. **协议抽象** - 通过 McpClientManager 抽象不同的传输方式
2. **实时状态管理** - 连接状态实时同步到前端
3. **性能优化** - 工具列表仅在内存缓存，避免数据库污染
4. **可扩展性** - 易于添加新的传输协议支持
5. **调试友好** - 完整记录所有 MCP 通信，便于调试
6. **类型安全** - Rust + TypeScript 双重类型保障
