use serde::Serialize;
use thiserror::Error;

/// 统一的应用错误枚举
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Domain rule violation: {0}")]
    Domain(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Tauri error: {0}")]
    Tauri(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

// 手动实现 Serialize，确保前端收到的是一个简单的对象结构
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field(
            "type",
            &format!("{:?}", self).split('(').next().unwrap_or("Unknown"),
        )?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Record not found".to_string()),
            _ => AppError::Database(err.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Tauri(err.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Unknown(err.to_string())
    }
}
