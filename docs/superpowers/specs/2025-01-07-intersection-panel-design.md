# 路线规划交互面板设计文档

**日期**: 2025-01-07  
**状态**: 待实现  
**作者**: Zoo (AI Assistant)

## 1. 概述

### 1.1 目标

为木鳥预设的五向劇情走向功能（`<intersection>`
标签）创建一个交互式 HTML 面板，让用户可以通过点选的方式选择路线，并自动将选中内容填入酒馆输入框。

### 1.2 当前问题

现有的 `不發送路線规划` 正则简单地删除了 `<intersection>`
标签内容，使得 AI 生成的路线建议对用户不可见且不可交互。用户需要手动复制粘贴或重新输入想要的路线。

### 1.3 解决方案

将正则替换方式从"删除"改为"转换成交互面板"：

- **正则部分**：输出带特殊标记的 HTML 结构 + CSS 样式
- **脚本部分**：监听 DOM 变化，为面板添加交互逻辑

## 2. 功能需求

### 2.1 核心功能

1. **内容解析**：从 `<intersection>` 标签中提取五个路线选项
2. **面板显示**：在 AI 消息楼层中嵌入式显示选择面板
3. **单选交互**：用户通过单选按钮选择一个路线
4. **确认提交**：点击确定按钮后，将选中路线填入酒馆输入框
5. **状态反馈**：提供视觉反馈（按钮状态、成功提示等）

### 2.2 输入格式

AI 输出的 `<intersection>` 标签内容示例：

```
<intersection>
 {{user}} 請求劇情走向建議：於正文後列出最多五個後續走向；每項約 20-40 字，描述可能性，不替 {{user}} 做決定。

fork１：【時間跳轉】跳至何時，以及期間發生的關鍵變化。
fork２：【場景發展】當前場景可能發生的事件或局面變化。
fork３：【NPC行動】NPC 可能採取的行動或主動介入。
fork４：【阻力形成】正在形成的限制、危險、衝突或代價。
fork５：【機會形成】正在形成的線索、資源、轉機或助力。
</intersection>
```

### 2.3 输出格式

用户选择 `fork１` 后，填入输入框的内容应为：

```
跳至何時，以及期間發生的關鍵變化。
```

**提取规则**：

- 移除 `fork[１-５]：` 前缀
- 移除 `【分类标签】` 部分
- 仅保留冒号后的具体描述文本

### 2.4 边缘情况

1. **格式异常**：AI 输出的 fork 数量不足 5 个或格式不规范
2. **重复面板**：用户查看历史消息时，多个面板同时存在
3. **输入框状态**：输入框被禁用、不存在或被其他插件占用
4. **用户未选择**：点击确定按钮时未选中任何选项

## 3. 技术架构

### 3.1 组件分工

#### 组件 A：正则替换（无 JavaScript）

**文件位置**：`预设/木鳥也想飛/木鳥也想飛.yaml` 中的正则配置

**职责**：

- 匹配 `<intersection>` 标签
- 解析内容并生成 HTML 结构
- 嵌入 CSS 样式
- 使用 `data-*` 属性存储选项数据

**输出示例**：

```html
<div class="intersection-panel" data-intersection-panel data-panel-id="1704600000000">
  <div class="panel-header">
    <h3 class="panel-title">劇情走向選擇</h3>
  </div>
  <form class="panel-form">
    <div class="options-container">
      <label class="option-item">
        <input type="radio" name="fork-1704600000000" value="跳至何時，以及期間發生的關鍵變化。" class="option-radio" />
        <span class="option-content">
          <span class="option-category">【時間跳轉】</span>
          <span class="option-text">跳至何時，以及期間發生的關鍵變化。</span>
        </span>
      </label>
      <!-- 重复 4 次，每个选项的 value 和文本不同 -->
    </div>
    <button type="submit" class="confirm-btn" disabled>確定選擇</button>
  </form>
</div>
<style>
  /* 完整的 CSS 样式，见 3.3 节 */
</style>
```

**关键设计决策**：

- 使用时间戳生成唯一 `data-panel-id`，确保多个面板互不干扰
- 单选按钮的 `name` 属性使用面板 ID，避免不同面板间互相影响
- 选项的完整文本（去除前缀后）直接存储在 `value` 属性中
- 初始状态下确定按钮设为 `disabled`

#### 组件 B：交互脚本

**文件位置**：`src/路线规划面板/index.ts`（编译后 `dist/路线规划面板/index.js`）

**职责**：

- 监听 DOM 变化，检测新生成的面板
- 为面板绑定事件监听器
- 处理用户选择和表单提交
- 操作酒馆输入框
- 提供错误处理和用户反馈

**核心逻辑流程**：

```
初始化
  ↓
监听聊天消息容器 (MutationObserver)
  ↓
检测到新的 [data-intersection-panel]
  ↓
初始化面板：
  - 绑定单选按钮 change 事件
  - 绑定表单 submit 事件
  ↓
用户选择选项
  ↓
启用确定按钮
  ↓
用户点击确定
  ↓
验证选择状态
  ↓
提取 value 属性值
  ↓
定位酒馆输入框 (#send_textarea)
  ↓
填入内容并触发 input 事件
  ↓
显示成功反馈
  ↓
更新面板状态（可选：禁用或隐藏）
```

### 3.2 HTML 结构设计

#### 语义化标签使用

```html
<div class="intersection-panel" data-intersection-panel data-panel-id="{timestamp}">
  <!-- 面板容器，使用 data 属性标记供脚本识别 -->

  <div class="panel-header">
    <h3 class="panel-title">劇情走向選擇</h3>
    <!-- 标题区域 -->
  </div>

  <form class="panel-form">
    <!-- 使用表单语义，支持 Enter 键提交 -->

    <div class="options-container">
      <!-- 选项列表容器 -->

      <label class="option-item">
        <!-- 每个选项是一个 label，点击文本也能选中 -->

        <input type="radio" name="fork-{panel-id}" value="{纯文本内容}" class="option-radio" />
        <!-- 单选按钮，name 使用面板 ID 确保唯一性 -->

        <span class="option-content">
          <span class="option-category">【分类】</span>
          <span class="option-text">具体描述文本</span>
        </span>
        <!-- 选项显示内容，分为分类标签和描述文本 -->
      </label>

      <!-- 重复 4 次 -->
    </div>

    <button type="submit" class="confirm-btn" disabled>確定選擇</button>
    <!-- 提交按钮，初始禁用 -->
  </form>
</div>
```

#### 可访问性考虑

- 使用 `<label>` 包裹单选按钮和文本，增大点击区域
- 表单语义支持键盘导航（Tab 键切换，Space 选择，Enter 提交）
- 按钮状态使用 `disabled` 属性而非仅视觉隐藏

### 3.3 CSS 样式设计

#### 设计原则

1. **主题适配**：使用酒馆 CSS 变量，自动适配深色/浅色主题
2. **响应式**：适配桌面端和移动端
3. **隔离性**：使用唯一类名前缀避免样式冲突
4. **一致性**：视觉风格与木鳥控制面板保持一致

#### 主题变量使用

```css
.intersection-panel {
  /* 背景色：使用模糊主题背景 */
  background: var(--SmartThemeBlurTintColor, #1e1e1e);

  /* 文字色：主题前景色 */
  color: var(--SmartThemeBodyColor, #e0e0e0);

  /* 边框色：使用主题前景色的半透明 */
  border: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 20%, transparent);

  /* 阴影：增强深度感 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

#### 关键样式规则

**面板容器**：

```css
.intersection-panel {
  width: 100%;
  max-width: 600px;
  margin: 1rem auto;
  padding: 1.5rem;
  border-radius: 12px;
  background: var(--SmartThemeBlurTintColor, #1e1e1e);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

**选项项**：

```css
.option-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.option-item:hover {
  background: color-mix(in srgb, var(--SmartThemeBodyColor) 8%, transparent);
}

.option-item:has(:checked) {
  background: color-mix(in srgb, var(--SmartThemeBorderColor) 15%, transparent);
  border: 1px solid var(--SmartThemeBorderColor);
}
```

**确定按钮**：

```css
.confirm-btn {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--SmartThemeBorderColor, #4a9eff);
  color: white;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(74, 158, 255, 0.3);
}
```

**响应式适配**：

```css
@media (max-width: 768px) {
  .intersection-panel {
    margin: 0.5rem;
    padding: 1rem;
  }

  .option-text {
    font-size: 0.9rem;
  }
}
```

### 3.4 JavaScript 实现细节

#### 脚本结构

```typescript
// src/路线规划面板/index.ts

import $ from 'jquery';
import toastr from 'toastr';

/** 面板选择器 */
const PANEL_SELECTOR = '[data-intersection-panel]';

/** 聊天消息容器选择器 */
const CHAT_CONTAINER_SELECTOR = '#chat';

/** 酒馆输入框选择器 */
const INPUT_TEXTAREA_SELECTOR = '#send_textarea';

/**
 * 初始化一个路线面板
 */
function initializePanel(panel: HTMLElement): void {
  const panelId = panel.dataset.panelId;
  if (!panelId) {
    console.warn('[路线规划面板] 面板缺少 panel-id');
    return;
  }

  const form = panel.querySelector('.panel-form') as HTMLFormElement;
  const confirmBtn = panel.querySelector('.confirm-btn') as HTMLButtonElement;
  const radios = panel.querySelectorAll('.option-radio') as NodeListOf<HTMLInputElement>;

  if (!form || !confirmBtn || radios.length === 0) {
    console.warn('[路线规划面板] 面板结构不完整');
    return;
  }

  // 监听单选按钮变化，启用确定按钮
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      confirmBtn.disabled = false;
    });
  });

  // 监听表单提交
  form.addEventListener('submit', e => {
    e.preventDefault();
    handleSubmit(panel, radios, confirmBtn);
  });

  console.info(`[路线规划面板] 已初始化面板 ${panelId}`);
}

/**
 * 处理表单提交
 */
function handleSubmit(panel: HTMLElement, radios: NodeListOf<HTMLInputElement>, confirmBtn: HTMLButtonElement): void {
  // 获取选中的选项
  const selected = Array.from(radios).find(r => r.checked);

  if (!selected) {
    toastr.warning('請先選擇一個選項');
    return;
  }

  const content = selected.value;

  // 定位输入框
  const $textarea = $(INPUT_TEXTAREA_SELECTOR);

  if ($textarea.length === 0) {
    toastr.error('無法找到輸入框');
    console.error('[路线规划面板] 输入框不存在');
    return;
  }

  if ($textarea.prop('disabled')) {
    toastr.error('輸入框當前不可用');
    return;
  }

  // 填入内容
  $textarea.val(content);

  // 触发 input 事件，让酒馆识别变化
  $textarea.trigger('input');

  // 聚焦到输入框
  $textarea.focus();

  // 成功反馈
  toastr.success('已填入輸入框');

  // 更新按钮状态
  confirmBtn.textContent = '✓ 已選擇';
  confirmBtn.disabled = true;

  // 禁用所有单选按钮
  radios.forEach(r => (r.disabled = true));

  console.info('[路线规划面板] 已填入:', content);
}

/**
 * 监听 DOM 变化，检测新面板
 */
function observePanels(): void {
  const container = document.querySelector(CHAT_CONTAINER_SELECTOR);

  if (!container) {
    console.warn('[路线规划面板] 聊天容器不存在，将在 DOMContentLoaded 后重试');
    return;
  }

  // 初始化已存在的面板
  container.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
    initializePanel(panel as HTMLElement);
  });

  // 监听新增面板
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          // 直接是面板
          if (element.matches(PANEL_SELECTOR)) {
            initializePanel(element);
          }

          // 包含面板的容器
          element.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
            initializePanel(panel as HTMLElement);
          });
        }
      });
    });
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
  });

  console.info('[路线规划面板] MutationObserver 已启动');
}

/**
 * 脚本入口
 */
$(() => {
  try {
    observePanels();
    console.info('[路线规划面板] 脚本已加载');
  } catch (e) {
    console.error('[路线规划面板] 初始化失败:', e);
  }
});
```

#### 错误处理策略

1. **面板结构验证**：检查必需的 DOM 元素是否存在
2. **输入框检测**：验证输入框存在且可用
3. **用户操作验证**：确保用户已选择选项
4. **降级处理**：如果脚本加载失败，HTML 面板仍可显示（只是无交互）

### 3.5 正则配置详细规范

#### 查找表达式

```regex
/<intersection>([\s\S]*?)<\/intersection>/gi
```

**说明**：

- 全局匹配（`g`）：处理一条消息中可能存在的多个 `<intersection>` 标签
- 忽略大小写（`i`）：兼容可能的大小写变体
- 非贪婪匹配（`*?`）：确保每个标签独立匹配

#### 替换内容生成逻辑

替换内容需要在正则配置中使用 JavaScript 来生成动态 HTML。酒馆正则的 `内容` 字段支持引用捕获组 `$1`。

**实现方式**：

由于酒馆正则的 `内容` 字段只支持简单的字符串替换，不支持复杂的 JavaScript 逻辑，我们需要：

1. **方案 A（推荐）**：创建一个正则脚本
   - 在 `预设/木鳥也想飛/正则/` 目录下创建 `路线规划面板.yaml`
   - 使用正则脚本功能，可以执行 JavaScript 代码

2. **方案 B**：手动编写包含占位符的模板
   - 在替换内容中硬编码 5 个选项的 HTML 结构
   - 使用正则捕获组提取每个 fork 的内容
   - 这种方式较复杂且不够灵活

**采用方案 A：正则脚本**

创建文件 `预设/木鳥也想飛/正则/路线规划面板转换.yaml`：

```yaml
- 正则名称: 路线规划面板转换
  启用: true
  查找表达式: /<intersection>([\s\S]*?)<\/intersection>/gi
  替换为: |
    {{!-- 使用正则脚本生成动态 HTML --}}
    {{setvar::__intersection_content::$1}}
    {{run: 
      const content = getvar('__intersection_content');
      const panelId = Date.now() + Math.random().toString(36).slice(2);
      
      // 解析 fork 选项
      const forkRegex = /fork[１-５]：【([^】]+)】(.+?)(?=\n|$)/g;
      const options = [];
      let match;
      
      while ((match = forkRegex.exec(content)) !== null) {
        options.push({
          category: match[1],
          text: match[2].trim()
        });
      }
      
      if (options.length === 0) {
        return '<!-- 路线规划面板：格式解析失败 -->';
      }
      
      // 生成 HTML
      let html = `<div class="intersection-panel" data-intersection-panel data-panel-id="${panelId}">`;
      html += '<div class="panel-header"><h3 class="panel-title">劇情走向選擇</h3></div>';
      html += '<form class="panel-form"><div class="options-container">';
      
      options.forEach((opt, idx) => {
        html += `<label class="option-item">`;
        html += `<input type="radio" name="fork-${panelId}" value="${opt.text}" class="option-radio">`;
        html += `<span class="option-content">`;
        html += `<span class="option-category">【${opt.category}】</span>`;
        html += `<span class="option-text">${opt.text}</span>`;
        html += `</span></label>`;
      });
      
      html += '</div><button type="submit" class="confirm-btn" disabled>確定選擇</button></form></div>';
      
      // CSS 样式
      html += '<style>/* CSS 内容见 3.3 节 */</style>';
      
      return html;
    }}
  来源:
    用户输入: false
    AI输出: true
    思维链: false
  作用于:
    仅格式显示: true
    仅格式提示词: true
```

**注意**：实际实现时，正则脚本语法可能有所不同，需要参考酒馆助手的正则脚本文档。如果酒馆正则不支持如此复杂的脚本，则需要采用**方案 C**。

#### 方案 C：正则脚本 + 酒馆助手脚本协作（最终方案）

由于酒馆正则的限制，我们采用更简单的方式：

**正则部分**：仅做标记，不生成完整 HTML

```yaml
- 正则名称: 不發送路線规划
  启用: true
  查找表达式: /<intersection>([\s\S]*?)<\/intersection>/gi
  内容: '<div class="intersection-placeholder" data-intersection-content="$1" style="display:none;"></div>'
  来源:
    用户输入: false
    AI输出: true
    思维链: false
  作用于:
    仅格式显示: true
    仅格式提示词: true
```

**脚本部分**：检测占位符并替换为完整面板

修改 `src/路线规划面板/index.ts` 的实现：

```typescript
/**
 * 将占位符转换为完整面板
 */
function replacePlaceholder(placeholder: HTMLElement): void {
  const content = placeholder.dataset.intersectionContent;
  if (!content) return;

  const panelId = Date.now() + Math.random().toString(36).slice(2);

  // 解析 fork 选项
  const forkRegex = /fork[１-５]：【([^】]+)】(.+?)(?=\n|$)/g;
  const options: Array<{ category: string; text: string }> = [];
  let match;

  while ((match = forkRegex.exec(content)) !== null) {
    options.push({
      category: match[1],
      text: match[2].trim(),
    });
  }

  if (options.length === 0) {
    console.warn('[路线规划面板] 无法解析选项');
    placeholder.remove();
    return;
  }

  // 生成面板 HTML
  const panel = document.createElement('div');
  panel.className = 'intersection-panel';
  panel.setAttribute('data-intersection-panel', '');
  panel.setAttribute('data-panel-id', panelId);

  panel.innerHTML = `
    <div class="panel-header">
      <h3 class="panel-title">劇情走向選擇</h3>
    </div>
    <form class="panel-form">
      <div class="options-container">
        ${options
          .map(
            opt => `
          <label class="option-item">
            <input type="radio" name="fork-${panelId}" value="${opt.text}" class="option-radio">
            <span class="option-content">
              <span class="option-category">【${opt.category}】</span>
              <span class="option-text">${opt.text}</span>
            </span>
          </label>
        `,
          )
          .join('')}
      </div>
      <button type="submit" class="confirm-btn" disabled>確定選擇</button>
    </form>
  `;

  // 注入样式（仅注入一次）
  if (!document.getElementById('intersection-panel-styles')) {
    const style = document.createElement('style');
    style.id = 'intersection-panel-styles';
    style.textContent = `/* CSS 内容见 3.3 节 */`;
    document.head.appendChild(style);
  }

  // 替换占位符
  placeholder.replaceWith(panel);

  // 初始化面板交互
  initializePanel(panel);
}

/**
 * 监听占位符并替换
 */
function observePlaceholders(): void {
  const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
  if (!container) return;

  // 处理已存在的占位符
  container.querySelectorAll('.intersection-placeholder').forEach(placeholder => {
    replacePlaceholder(placeholder as HTMLElement);
  });

  // 监听新增占位符
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          if (element.matches('.intersection-placeholder')) {
            replacePlaceholder(element);
          }

          element.querySelectorAll('.intersection-placeholder').forEach(placeholder => {
            replacePlaceholder(placeholder as HTMLElement);
          });
        }
      });
    });
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
  });
}
```

## 4. 实现计划

### 4.1 文件清单

需要创建或修改的文件：

1. **`src/路线规划面板/index.ts`**（新建）
   - 脚本主逻辑

2. **`预设/木鳥也想飛/木鳥也想飛.yaml`**（修改）
   - 修改正则 `不發送路線规划` 的配置
   - 添加脚本库配置

3. **`dist/路线规划面板/index.js`**（构建生成）
   - 编译后的脚本文件

### 4.2 实现步骤

1. **创建脚本项目结构**
   - 在 `src/` 下创建 `路线规划面板/` 目录
   - 创建 `index.ts` 文件

2. **实现占位符检测和替换逻辑**
   - 编写 `replacePlaceholder()` 函数
   - 实现内容解析和 HTML 生成
   - 添加样式注入逻辑

3. **实现面板交互逻辑**
   - 编写 `initializePanel()` 函数
   - 实现事件监听（单选、提交）
   - 实现输入框填充逻辑

4. **编写 CSS 样式**
   - 定义面板和选项样式
   - 实现主题适配
   - 添加响应式规则

5. **修改正则配置**
   - 更新 `不發送路線规划` 正则的替换内容
   - 改为输出占位符而非删除

6. **添加脚本到预设**
   - 在预设的 `酒馆助手.脚本库` 中添加新脚本
   - 配置脚本启用和按钮

7. **构建和测试**
   - 运行 `pnpm build`
   - 导入预设到酒馆
   - 测试各种场景和边缘情况

### 4.3 测试计划

#### 单元测试场景

1. **正常流程测试**
   - AI 输出标准的 5 个 fork 选项
   - 用户选择任一选项并确定
   - 验证内容正确填入输入框

2. **格式异常测试**
   - 少于 5 个 fork
   - Fork 格式不规范
   - 缺少分类标签

3. **交互异常测试**
   - 未选择就点击确定
   - 输入框被禁用
   - 输入框不存在

4. **多面板测试**
   - 同时存在多个历史面板
   - 验证各面板互不干扰

5. **兼容性测试**
   - 桌面端浏览器（Chrome, Firefox, Safari）
   - 移动端浏览器
   - 深色/浅色主题切换

## 5. 用户体验优化

### 5.1 视觉反馈

1. **选择状态**
   - 悬停效果：半透明背景高亮
   - 选中效果：边框和背景色变化
   - 确定按钮：从禁用到可用的视觉变化

2. **操作反馈**
   - 成功填入：toastr 提示 + 按钮文字变为"✓ 已選擇"
   - 错误提示：toastr 警告信息

3. **动画效果**
   - 按钮悬停：轻微上浮 + 阴影增强
   - 状态切换：0.2s 平滑过渡

### 5.2 键盘支持

- **Tab 键**：在选项间切换焦点
- **Space 键**：选中当前焦点的选项
- **Enter 键**：提交表单（选中选项后）
- **方向键**：在单选按钮间导航（浏览器原生支持）

### 5.3 无障碍访问

- 使用语义化 HTML 标签
- `<label>` 与 `<input>` 正确关联
- 表单结构支持屏幕阅读器
- 按钮状态使用 `disabled` 属性

### 5.4 性能优化

1. **样式注入**：全局只注入一次 CSS
2. **事件委托**：在面板级别监听事件，而非每个选项
3. **防抖处理**：如果需要，对 MutationObserver 回调进行防抖

## 6. 维护和扩展

### 6.1 可配置选项（未来）

可以考虑在木鳥控制面板中添加配置选项：

- 是否自动滚动到输入框
- 确定后是否隐藏面板
- 面板主题色自定义
- 是否启用键盘快捷键

### 6.2 功能扩展方向

1. **历史记录**：保存用户选择的路线
2. **自定义输入**：允许用户修改选项文本
3. **多选模式**：支持选择多个路线并组合
4. **快捷操作**：双击选项直接填入（无需确定）

### 6.3 已知限制

1. **依赖格式**：严格依赖 AI 输出固定的 fork 格式
2. **静态面板**：填入后面板变为静态，无法重新选择
3. **单一输入框**：假定酒馆只有一个主输入框

## 7. 风险和缓解

### 7.1 风险识别

| 风险            | 影响 | 概率 | 缓解措施                                |
| --------------- | ---- | ---- | --------------------------------------- |
| AI 输出格式变化 | 高   | 中   | 增强解析鲁棒性，显示原始文本作为降级    |
| 酒馆 API 变更   | 高   | 低   | 定期测试，及时更新选择器                |
| 样式冲突        | 中   | 低   | 使用唯一类名前缀，避免全局污染          |
| 性能问题        | 低   | 低   | MutationObserver 范围限定，避免过度监听 |
| 移动端体验      | 中   | 中   | 响应式设计，移动端测试                  |

### 7.2 回滚计划

如果新功能出现严重问题：

1. 禁用 `路线规划面板脚本`
2. 将 `不發送路線规划` 正则恢复为原始删除模式
3. 用户体验退回到当前状态（路线不可见）

## 8. 成功标准

实现完成后，应满足以下标准：

### 8.1 功能完整性

- [ ] AI 输出 `<intersection>` 后，面板正确显示
- [ ] 面板显示所有 5 个选项
- [ ] 单选交互正常工作
- [ ] 确定按钮状态正确切换
- [ ] 选中内容正确填入输入框
- [ ] 错误情况有友好提示

### 8.2 视觉质量

- [ ] 面板样式与木鳥控制面板一致
- [ ] 深色和浅色主题都正常显示
- [ ] 移动端布局正常
- [ ] 交互动画流畅自然

### 8.3 代码质量

- [ ] TypeScript 类型安全
- [ ] 代码结构清晰，注释完整
- [ ] 无 console 错误或警告
- [ ] 符合项目编码规范

### 8.4 用户体验

- [ ] 交互流程直观易懂
- [ ] 响应速度快（<100ms）
- [ ] 错误提示清晰有用
- [ ] 支持键盘操作

## 9. 时间估算

| 任务               | 预计时间  |
| ------------------ | --------- |
| 创建脚本结构       | 30分钟    |
| 实现 HTML 生成逻辑 | 1小时     |
| 实现交互逻辑       | 1.5小时   |
| 编写 CSS 样式      | 1小时     |
| 修改正则配置       | 30分钟    |
| 测试和调试         | 2小时     |
| 文档和注释         | 30分钟    |
| **总计**           | **7小时** |

## 10. 附录

### 10.1 完整 CSS 代码

```css
.intersection-panel {
  width: 100%;
  max-width: 600px;
  margin: 1rem auto;
  padding: 1.5rem;
  border-radius: 12px;
  background: var(--SmartThemeBlurTintColor, #1e1e1e);
  border: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 20%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  color: var(--SmartThemeBodyColor, #e0e0e0);
  font-family: var(--mainFontFamily, 'Noto Sans', sans-serif);
}

.panel-header {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 15%, transparent);
}

.panel-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--SmartThemeBorderColor, #4a9eff);
}

.panel-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.options-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.option-item:hover {
  background: color-mix(in srgb, var(--SmartThemeBodyColor) 8%, transparent);
}

.option-item:has(:checked) {
  background: color-mix(in srgb, var(--SmartThemeBorderColor) 15%, transparent);
  border-color: var(--SmartThemeBorderColor, #4a9eff);
}

.option-radio {
  margin-top: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.option-category {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--SmartThemeBorderColor, #4a9eff);
}

.option-text {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--SmartThemeBodyColor, #e0e0e0);
}

.confirm-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--SmartThemeBorderColor, #4a9eff);
  color: white;
  font-family: inherit;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: color-mix(in srgb, var(--SmartThemeBodyColor) 30%, transparent);
}

.confirm-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(74, 158, 255, 0.3);
}

.confirm-btn:not(:disabled):active {
  transform: translateY(0);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .intersection-panel {
    margin: 0.5rem;
    padding: 1rem;
    border-radius: 8px;
  }

  .panel-title {
    font-size: 1.1rem;
  }

  .option-item {
    padding: 0.75rem;
  }

  .option-category {
    font-size: 0.9rem;
  }

  .option-text {
    font-size: 0.875rem;
  }

  .confirm-btn {
    padding: 0.625rem;
    font-size: 0.95rem;
  }
}

/* 暗色模式增强 */
@media (prefers-color-scheme: dark) {
  .intersection-panel {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}
```

### 10.2 完整 TypeScript 代码

见 3.4 节和 3.5 节的代码示例，以及最终实现计划中的完整版本。

### 10.3 参考资料

- [酒馆助手官方文档](https://n0vi028.github.io/JS-Slash-Runner-Doc/)
- [SillyTavern GitHub](https://github.com/SillyTavern/SillyTavern)
- 项目现有代码：`src/木鳥控制面板/` 和 `src/预设控制面板/`

---

**文档状态**: 已完成  
**下一步**: 编写实现计划并开始开发
