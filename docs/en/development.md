# Development Guide

This guide explains how to develop new features based on this template.

## Development Environment

```bash
# Start development mode
make dev

# Check Rust code
cargo check

# Check TypeScript code
cd apps/desktop && npx tsc --noEmit
```

## Adding Backend Features

### Step 1: Define Domain Model (Domain Layer)

Create a new module in `src-tauri/src/domain/`:

```rust
// domain/products.rs

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::domain::cqrs::{Command, Query};

// Entity
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub price: f64,
}

// Command (write operation)
#[derive(Debug, Deserialize)]
pub struct CreateProductCmd {
    pub name: String,
    pub price: f64,
}
impl Command for CreateProductCmd {}

// Query (read operation)
#[derive(Debug)]
pub struct ListProductsQuery;
impl Query for ListProductsQuery {}

// Repository trait
#[async_trait]
pub trait IProductRepository: Send + Sync {
    async fn create(&self, product: Product) -> Result<Product, AppError>;
    async fn list(&self) -> Result<Vec<Product>, AppError>;
}
```

Export in `domain/mod.rs`:

```rust
pub mod products;
```

### Step 2: Implement Handlers (Application Layer)

Create command handler `application/product_commands.rs`:

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

Create query handler `application/product_queries.rs`:

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

### Step 3: Implement Repository (Infrastructure Layer)

Create `infra/repo_products.rs`:

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

### Step 4: Add Database Migration

Create `migrations/20250102000001_add_products.sql`:

```sql
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL
);
```

### Step 5: Expose Tauri Commands (Interface Layer)

Add to `interface/commands.rs`:

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

### Step 6: Register with Tauri (main.rs)

```rust
// Create repository and handlers
let product_repo = Arc::new(SqliteProductRepository::new(pool.clone()));
let product_cmd_handler = ProductCommandHandler::new(product_repo.clone());
let product_query_handler = ProductQueryHandler::new(product_repo);

app_handle.manage(product_cmd_handler);
app_handle.manage(product_query_handler);

// Register in invoke_handler
interface::commands::create_product,
interface::commands::list_products,
```

## Adding Frontend Features

### Create Hook

In `src/hooks/useProducts.ts`:

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

### Create Page

In `src/pages/ProductsPage.tsx`:

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

### Add Route

Register the route in `App.tsx`.

### Add i18n

Add translation keys in `i18n/locales/zh-CN.json` and `en-US.json`.

## Debugging

### Rust Logging

```rust
use tracing::{info, error, debug};

info!("User created: {}", user.id);
error!("Failed to create user: {:?}", err);
```

### Frontend Logging

```typescript
import { logger } from '@/lib/logger';

logger.info('User created', { userId: user.id });
```

### View Log Files

Click "Open Log Folder" in Settings, or call:

```typescript
await invoke('open_log_folder');
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Rust compile error | Run `cargo check` for details |
| Frontend type error | Run `npx tsc --noEmit` |
| Database table missing | Check migration files or recreate database |
| Command not registered | Check `invoke_handler` in `main.rs` |
| Hook data not updating | Check `queryKey` and `invalidateQueries` |
