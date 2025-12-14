use crate::error::AppError;
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(Clone)]
pub struct HttpClient {
    inner: Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<serde_json::Value>,
    pub query: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: serde_json::Value,
}

impl HttpClient {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Tauri-React-Template/0.1.0")
            .no_proxy()
            .build()
            .map_err(|e| AppError::Unknown(format!("Failed to build http client: {}", e)))?;

        Ok(Self { inner: client })
    }

    pub async fn execute(&self, request: HttpRequest) -> Result<HttpResponse, AppError> {
        let method = Method::from_bytes(request.method.as_bytes())
            .map_err(|_| AppError::Unknown("Invalid HTTP method".to_string()))?;

        let url =
            Url::parse(&request.url).map_err(|_| AppError::Unknown("Invalid URL".to_string()))?;

        let mut req_builder = self.inner.request(method, url);

        // Add Query Params
        if let Some(query) = request.query {
            req_builder = req_builder.query(&query);
        }

        // Add Headers
        if let Some(headers) = request.headers {
            for (k, v) in headers {
                req_builder = req_builder.header(k, v);
            }
        }

        // Add Body (JSON)
        if let Some(body) = request.body {
            req_builder = req_builder.json(&body);
        }

        // Execute
        let response =
            req_builder.send().await.map_err(|e| AppError::Io(format!("Request failed: {}", e)))?;

        let status = response.status().as_u16();

        // Convert headers to HashMap
        let mut res_headers = HashMap::new();
        for (k, v) in response.headers() {
            if let Ok(val_str) = v.to_str() {
                res_headers.insert(k.to_string(), val_str.to_string());
            }
        }

        // Parse JSON body (if possible, otherwise text/null)
        let body_json: serde_json::Value = response.json().await.unwrap_or(serde_json::Value::Null);

        Ok(HttpResponse { status, headers: res_headers, body: body_json })
    }
}
