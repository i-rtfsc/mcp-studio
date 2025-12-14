# 开发指南

本指南介绍如何基于此模板进行日常开发，包括添加新功能、前后端协作等。

## 开发环境

```bash
# 启动开发模式
make dev

# 检查 Rust 代码
cargo check

# 检查 TypeScript 代码
cd apps/desktop && npx tsc --noEmit
```

## 添加后端功能

### 步骤 1: 定义领域模型 (Domain Layer)

在 `src-tauri/src/domain/` 创建新模块：

```rust
// domain/products.rs

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::domain::cqrs::{Command, Query};

// 实体
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub price: f64,
}

// 命令 (写操作)
#[derive(Debug, Deserialize)]
pub struct CreateProductCmd {
    pub name: String,
    pub price: f64,
}
impl Command for CreateProductCmd {}

// 查询 (读操作)
#[derive(Debug)]
pub struct ListProductsQuery;
impl Query for ListProductsQuery {}

// 仓储接口
#[async_trait]
pub trait IProductRepository: Send + Sync {
    async fn create(&self, product: Product) -> Result<Product, AppError>;
    async fn list(&self) -> Result<Vec<Product>, AppError>;
}
```

在 `domain/mod.rs` 中导出：

```rust
pub mod products;
```

### 步骤 2: 实现 Handlers (Application Layer)

创建命令处理器 `application/product_commands.rs`：

```rust
use std::sync::Arc;
use async_trait::async_trait;
use uuid::Uuid;
use crate::domain::cqrs::CommandHandler;
use crate::domain::products::{CreateProductCmd, IProductRepository, Product};
use crate::error::AppError;

pub struct ProductCommandHandler {
    repo: Arc<dyn IProductRepository>,
}

impl ProductCommandHandler {
    pub fn new(repo: Arc<dyn IProductRepository>) -> Self {
        Self { repo }
    }
}

#[async_trait]
impl CommandHandler<CreateProductCmd, Product> for ProductCommandHandler {
    async fn handle(&self, cmd: CreateProductCmd) -> Result<Product, AppError> {
        let product = Product {
            id: Uuid::new_v4().to_string(),
            name: cmd.name,
            price: cmd.price,
        };
        self.repo.create(product).await
    }
}
```

创建查询处理器 `application/product_queries.rs`：

```rust
use std::sync::Arc;
use async_trait::async_trait;
use crate::domain::cqrs::QueryHandler;
use crate::domain::products::{IProductRepository, ListProductsQuery, Product};
use crate::error::AppError;

pub struct ProductQueryHandler {
    repo: Arc<dyn IProductRepository>,
}

impl ProductQueryHandler {
    pub fn new(repo: Arc<dyn IProductRepository>) -> Self {
        Self { repo }
    }
}

#[async_trait]
impl QueryHandler<ListProductsQuery, Vec<Product>> for ProductQueryHandler {
    async fn handle(&self, _query: ListProductsQuery) -> Result<Vec<Product>, AppError> {
        self.repo.list().await
    }
}
```

### 步骤 3: 实现仓储 (Infrastructure Layer)

创建 `infra/repo_products.rs`：

```rust
use async_trait::async_trait;
use sqlx::SqlitePool;
use crate::domain::products::{IProductRepository, Product};
use crate::error::AppError;

pub struct SqliteProductRepository {
    pool: SqlitePool,
}

impl SqliteProductRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IProductRepository for SqliteProductRepository {
    async fn create(&self, product: Product) -> Result<Product, AppError> {
        sqlx::query("INSERT INTO products (id, name, price) VALUES (?, ?, ?)")
            .bind(&product.id)
            .bind(&product.name)
            .bind(&product.price)
            .execute(&self.pool)
            .await?;
        Ok(product)
    }

    async fn list(&self) -> Result<Vec<Product>, AppError> {
        let products = sqlx::query_as::<_, Product>("SELECT * FROM products")
            .fetch_all(&self.pool)
            .await?;
        Ok(products)
    }
}
```

### 步骤 4: 添加数据库迁移

创建 `migrations/20250102000001_add_products.sql`：

```sql
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL
);
```

### 步骤 5: 暴露 Tauri 命令 (Interface Layer)

在 `interface/commands.rs` 中添加：

```rust
use crate::application::{ProductCommandHandler, ProductQueryHandler};
use crate::domain::products::{CreateProductCmd, ListProductsQuery, Product};

#[tauri::command]
pub async fn create_product(
    handler: State<'_, ProductCommandHandler>,
    cmd: CreateProductCmd,
) -> Result<Product, AppError> {
    handler.handle(cmd).await
}

#[tauri::command]
pub async fn list_products(
    handler: State<'_, ProductQueryHandler>,
) -> Result<Vec<Product>, AppError> {
    handler.handle(ListProductsQuery).await
}
```

### 步骤 6: 注册到 Tauri (main.rs)

```rust
// 创建仓储和 Handlers
let product_repo = Arc::new(SqliteProductRepository::new(pool.clone()));
let product_cmd_handler = ProductCommandHandler::new(product_repo.clone());
let product_query_handler = ProductQueryHandler::new(product_repo);

app_handle.manage(product_cmd_handler);
app_handle.manage(product_query_handler);

// 在 invoke_handler 中注册命令
interface::commands::create_product,
interface::commands::list_products,
```

## 添加前端功能

### 创建 Hook

在 `src/hooks/useProducts.ts`：

```typescript
import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Product {
  id: string;
  name: string;
  price: number;
}

export function useProducts() {
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => invoke<Product[]>('list_products'),
  });

  const createProduct = useMutation({
    mutationFn: (cmd: { name: string; price: number }) =>
      invoke<Product>('create_product', { cmd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return { products, isLoading, createProduct };
}
```

### 创建页面

在 `src/pages/ProductsPage.tsx`：

```tsx
import { useProducts } from '@/hooks/useProducts';

export function ProductsPage() {
  const { products, isLoading, createProduct } = useProducts();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products?.map((p) => (
          <li key={p.id}>{p.name} - ${p.price}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 添加路由

在 `App.tsx` 中添加路由。

### 添加国际化

在 `i18n/locales/zh-CN.json` 和 `en-US.json` 中添加翻译 key。

## 调试技巧

### Rust 日志

```rust
use tracing::{info, error, debug};

info!("User created: {}", user.id);
error!("Failed to create user: {:?}", err);
```

### 前端日志

```typescript
import { logger } from '@/lib/logger';

logger.info('User created', { userId: user.id });
```

### 查看日志文件

在设置页面点击「打开日志文件夹」，或调用：

```typescript
await invoke('open_log_folder');
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| Rust 编译错误 | 运行 `cargo check` 查看详细错误 |
| 前端类型错误 | 运行 `npx tsc --noEmit` |
| 数据库表不存在 | 检查迁移文件，或删除数据库重建 |
| 命令未注册 | 检查 `main.rs` 的 `invoke_handler` |
| Hook 数据不更新 | 检查 `queryKey` 和 `invalidateQueries` |
