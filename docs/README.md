# 文档中心

[English](./en/README.md) | 简体中文

欢迎来到 **MCP Studio** 文档中心。MCP Studio 是一个专业的 MCP (Model Context Protocol) 客户端调试工具。

## 文档导航

| 文档 | 说明 |
|------|------|
| [快速开始](./getting-started/) | 环境配置、安装运行、构建发布 |
| [架构设计](./architecture/) | DDD + CQRS 架构详解 |
| [开发指南](./development.md) | 日常开发、添加功能、调试技巧 |
| [更新日志](./changelog.md) | 版本更新记录 |

## 推荐阅读顺序

1. **[快速开始](./getting-started/)** - 搭建开发环境，运行项目
2. **[架构设计](./architecture/)** - 理解 DDD + CQRS 架构
3. **[开发指南](./development.md)** - 学习如何扩展功能

## Documentation Structure

```
docs/
├── README.md                    # 文档中心（中文）
├── getting-started/
│   └── index.md               # 快速开始指南
├── architecture/
│   └── index.md               # 架构设计文档
├── development.md             # 开发指南
└── en/                         # English documentation
    ├── README.md
    ├── getting-started/
    │   └── index.md           # Getting Started Guide
    ├── architecture/
    │   └── index.md           # Architecture Design
    └── development.md         # Development Guide
```

## 架构概览

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

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 构建
- shadcn/ui (40+ 组件)
- TanStack Query + Zustand
- i18next 多语言

### 后端
- Rust + Tauri 2
- SQLx + SQLite
- DDD + CQRS 架构
- Tracing 日志

## 快速命令

```bash
make install    # 安装依赖
make dev        # 开发模式
make build      # 构建发布
make clean      # 清理
```
