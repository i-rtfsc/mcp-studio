use crate::domain::config::IConfigRepository;
use crate::error::AppError;
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::collections::HashMap;

pub struct SqliteConfigRepository {
    pool: SqlitePool,
}

impl SqliteConfigRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IConfigRepository for SqliteConfigRepository {
    async fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        let result =
            sqlx::query_scalar::<_, String>("SELECT value FROM system_settings WHERE key = ?")
                .bind(key)
                .fetch_optional(&self.pool)
                .await?;
        Ok(result)
    }

    async fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        // Upsert (Insert or Update)
        sqlx::query("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_all(&self) -> Result<HashMap<String, String>, AppError> {
        let rows = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM system_settings")
            .fetch_all(&self.pool)
            .await?;

        let map = rows.into_iter().collect();
        Ok(map)
    }
}
