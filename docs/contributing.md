# 贡献指南 | Contributing Guide

[English](#english) | [中文](#中文)

---

## 中文

感谢关注本项目！我们欢迎任何形式的贡献（Issue、文档、代码等）。

### 如何贡献

1. **报告问题**：在 GitHub Issues 提交 Bug / 功能建议
2. **改进文档**：修正文案或补充示例
3. **提交代码**：修复缺陷或扩展模板能力

### 基本流程

1. Fork 项目并克隆到本地
   ```bash
   git clone https://github.com/<your-username>/tauri2-react-template.git
   cd tauri2-react-template
   ```
2. 创建功能分支
   ```bash
   git checkout -b feature/my-feature
   ```
3. 安装依赖并运行项目
   ```bash
   npm install && npm run install:all   # 或 make install
   npm run dev                          # 或 make dev
   ```
4. 变更完成后运行最小验证
   ```bash
   npm run build
   cd apps/desktop/src-tauri && cargo check
   ```
5. 提交并推送
   ```bash
   git add .
   git commit -m "feat(users): add bulk delete"
   git push origin feature/my-feature
   ```
6. 在 GitHub 创建 Pull Request，说明改动背景/影响

### Commit 类型建议
- `feat`: 新功能
- `fix`: 缺陷修复
- `docs`: 文档
- `refactor`: 重构
- `style`: 代码格式
- `chore`: 构建/依赖

### 提交前检查
- [ ] `npm run build` 成功
- [ ] `cargo check` 成功
- [ ] 文档（README / docs/*）已更新
- [ ] 翻译文本已同步中英文
- [ ] CHANGELOG 中记录了用户可见的变化（如适用）

### 获取帮助
- 阅读 [文档索引](./README.md)
- 搜索 [Issues](https://github.com/your-repo/issues)
- 提交新的 Issue / 讨论

### 行为准则
请遵守 [Code of Conduct](./code_of_conduct.md)。

---

## English

Thank you for your interest in contributing! All kinds of contributions (issues, docs, code) are appreciated.

### Ways to help
1. **Report issues** – bug reports or feature ideas
2. **Improve docs** – fix typos, clarify instructions, add examples
3. **Submit code** – bug fixes, new features, tooling improvements

### Workflow
1. Fork and clone the repo
   ```bash
   git clone https://github.com/<your-username>/tauri2-react-template.git
   cd tauri2-react-template
   ```
2. Create a topic branch
   ```bash
   git checkout -b feature/my-feature
   ```
3. Install deps & run the app
   ```bash
   npm install && npm run install:all   # or make install
   npm run dev                          # or make dev
   ```
4. Validate before submitting
   ```bash
   npm run build
   cd apps/desktop/src-tauri && cargo check
   ```
5. Commit & push
   ```bash
   git add .
   git commit -m "fix(settings): handle failed log open"
   git push origin feature/my-feature
   ```
6. Open a Pull Request describing the motivation, approach, and testing

### Commit types
`feat`, `fix`, `docs`, `refactor`, `style`, `chore`, etc. (Conventional Commits are encouraged but not strictly required.)

### PR checklist
- [ ] `npm run build` passes
- [ ] `cargo check` passes
- [ ] Docs updated if behavior or commands changed
- [ ] i18n strings exist in both `en-US` and `zh-CN` when applicable
- [ ] Changelog updated if the change is user-facing

### Need help?
- Start with the [documentation hub](./README.md)
- Search [Issues](https://github.com/your-repo/issues)
- Ask questions via a new Issue or discussion

### Code of Conduct
Please follow our [Code of Conduct](./code_of_conduct.md) to keep the community welcoming.

Thanks for making the template better! 🙏
