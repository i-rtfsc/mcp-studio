# App 图标资源 | Icon Resources

## 🎨 免费图标下载网站

### 1. **IconKitchen** (推荐)
- 网址: https://icon.kitchen/
- 特点: 专门为应用生成图标，支持自定义颜色、形状
- 格式: 直接生成所有平台需要的尺寸
- 使用: 上传 SVG/PNG，自动生成全套图标

### 2. **Flaticon**
- 网址: https://www.flaticon.com/
- 特点: 海量免费图标，质量高
- 格式: PNG, SVG
- 注意: 需要标注来源（免费版）

### 3. **Icons8**
- 网址: https://icons8.com/icons
- 特点: 多种风格，可自定义颜色
- 格式: PNG, SVG
- 使用: 可下载大尺寸 PNG

### 4. **Noun Project**
- 网址: https://thenounproject.com/
- 特点: 简约风格图标
- 格式: PNG, SVG
- 注意: 部分需要会员

### 5. **Iconify**
- 网址: https://icon-sets.iconify.design/
- 特点: 整合了多个图标库
- 格式: SVG
- 开源免费

### 6. **Material Icons**
- 网址: https://fonts.google.com/icons
- 特点: Google 官方，Material Design 风格
- 格式: PNG, SVG
- 完全免费

## 📦 如何使用下载的图标

### 方法 1: 使用 PNG 图标

1. **下载至少 1024x1024 的 PNG 图标**
2. **保存为 `app-icon.png`**
3. **生成所有尺寸的图标**:
   ```bash
   cd apps/desktop
   npx @tauri-apps/cli icon app-icon.png -o src-tauri
   ```

### 方法 2: 使用 SVG 图标

1. **下载 SVG 格式图标**
2. **转换为 PNG**:
   - 在线转换: https://cloudconvert.com/svg-to-png
   - 或使用 Inkscape/Figma 导出为 1024x1024 PNG
3. **运行生成命令** (同上)

## 🎨 图标设计建议

### 尺寸要求
- **最小**: 512x512 px
- **推荐**: 1024x1024 px
- **格式**: PNG (带透明背景) 或 SVG

### 设计原则
1. **简洁**: 避免太多细节
2. **对比度**: 确保在深色/浅色背景都清晰
3. **居中**: 图标主体居中，留边距
4. **圆角**: 现代风格建议使用圆角

### 颜色建议
- 使用渐变色（更现代）
- 主色调 + 辅助色
- 避免纯黑/纯白（使用稍微有色彩的版本）

## 🛠️ 图标生成工具

### 在线工具

1. **Canva** (https://www.canva.com/)
   - 有 App Icon 模板
   - 可直接设计并导出

2. **Figma** (https://www.figma.com/)
   - 专业设计工具
   - 免费版足够用

3. **Photopea** (https://www.photopea.com/)
   - 在线 Photoshop 替代品
   - 完全免费

### 命令行工具

```bash
# 使用 ImageMagick 调整尺寸
convert input.png -resize 1024x1024 app-icon.png

# 使用 PIL (Python)
python3 -c "from PIL import Image; img = Image.open('input.png'); img.resize((1024, 1024)).save('app-icon.png')"
```

## 📁 生成的图标文件

运行 `npx @tauri-apps/cli icon` 后会生成：

```
src-tauri/icons/
├── 32x32.png           # Windows 小图标
├── 128x128.png         # Windows 中等图标
├── 128x128@2x.png      # macOS Retina
├── icon.icns           # macOS 图标
├── icon.ico            # Windows 图标
├── icon.png            # 通用图标
└── Square*x*.png       # Windows 磁贴图标
```

**可以删除的临时文件**:
- `app-icon.png` (源文件，生成后可删除或保留作为备份)
- Android/iOS 相关图标 (如果只做桌面应用)

## 💡 快速推荐

如果你现在就需要一个图标：

1. **最快方式**: 去 https://icon.kitchen/
   - 选择一个图标
   - 选择喜欢的颜色
   - 下载 1024x1024 PNG
   - 运行生成命令

2. **高质量图标**: 去 https://www.flaticon.com/
   - 搜索关键词（如 "app", "desktop", "technology"）
   - 下载 PNG 512px
   - 用工具放大到 1024px
   - 运行生成命令

3. **Material 风格**: 去 https://fonts.google.com/icons
   - 选择图标
   - 下载 SVG
   - 转换为 PNG
   - 运行生成命令

## 🔧 当前项目图标

当前使用的是程序生成的蓝紫渐变 "T" 字图标。

要替换：
1. 下载新图标
2. 命名为 `app-icon.png`
3. 放在 `apps/desktop/` 目录
4. 运行: `npx @tauri-apps/cli icon app-icon.png -o src-tauri`
5. 删除 Android/iOS 图标 (可选):
   ```bash
   cd apps/desktop/src-tauri
   rm -rf gen/android gen/apple
   ```

---

**提示**: 图标是应用的门面，建议花些时间选择或设计一个好看的图标！
