# 路线规划面板

为木鳥预设的五向劇情走向功能提供交互式 HTML 面板。

## 功能

- 自动检测 AI 输出的 `<intersection>` 标签
- 将路线选项转换为可交互的面板
- 用户选择后自动填入酒馆输入框

## 技术实现

- **正则替换**：将 `<intersection>` 转换为隐藏占位符
- **脚本监听**：MutationObserver 检测占位符
- **动态生成**：解析内容并生成完整交互面板
- **事件处理**：监听用户选择并操作输入框

## 使用方法

1. 确保预设中正则 `不發送路線规划` 已启用
2. 确保脚本 `路线规划面板` 已启用
3. AI 生成包含 `<intersection>` 标签的回复时自动显示面板

## 开发

```bash
# 构建
pnpm build

# 输出位置
dist/路线规划面板/index.js
```

## 依赖

- jQuery
- toastr
- 酒馆助手 API

## 相关文件

- 设计文档: `docs/superpowers/specs/2025-01-07-intersection-panel-design.md`
- 实现计划: `docs/superpowers/plans/2025-01-07-intersection-panel.md`
- 测试报告: `docs/superpowers/测试报告-路线规划面板.md`
