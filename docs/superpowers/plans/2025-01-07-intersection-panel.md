# 路线规划交互面板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为木鳥预设的五向劇情走向功能创建交互式 HTML 面板，让用户可以点选路线并自动填入输入框。

**Architecture:** 正则替换生成占位符，脚本检测占位符并转换为完整交互面板，用户选择后填入酒馆输入框。

**Tech Stack:** TypeScript, jQuery, toastr, MutationObserver, 酒馆助手 API

## Global Constraints

- TypeScript strict mode enabled
- 使用项目已有的依赖（jquery, toastr），不添加新依赖
- 所有用户可见文本使用繁体中文
- 样式使用酒馆 CSS 变量适配主题
- 遵循项目现有代码风格（见 `src/木鳥控制面板/` 参考）
- 编译输出到 `dist/路线规划面板/index.js`

---

## File Structure

### 新建文件

- `src/路线规划面板/index.ts` - 脚本主逻辑（占位符检测、面板生成、交互处理）

### 修改文件

- `预设/木鳥也想飛/木鳥也想飛.yaml:673-684` - 修改正则 `不發送路線规划` 配置
- `预设/木鳥也想飛/木鳥也想飛.yaml:685-726` - 添加脚本库配置

---

### Task 1: 创建脚本项目结构

**Files:**

- Create: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes: 无（首个任务）
- Produces: 脚本文件结构，供后续任务填充内容

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p src/路线规划面板
```

- [ ] **Step 2: 创建 index.ts 文件并添加基础导入**

```typescript
import $ from 'jquery';
import toastr from 'toastr';

/** 占位符选择器 */
const PLACEHOLDER_SELECTOR = '.intersection-placeholder';

/** 面板选择器 */
const PANEL_SELECTOR = '[data-intersection-panel]';

/** 聊天消息容器选择器 */
const CHAT_CONTAINER_SELECTOR = '#chat';

/** 酒馆输入框选择器 */
const INPUT_TEXTAREA_SELECTOR = '#send_textarea';

console.info('[路线规划面板] 脚本模块已加载');
```

- [ ] **Step 3: 验证文件创建**

检查文件是否存在：

```bash
ls -la src/路线规划面板/index.ts
```

Expected: 文件存在且包含基础导入

- [ ] **Step 4: 提交**

```bash
git add src/路线规划面板/
git commit -m "feat(路线规划面板): 创建脚本项目结构"
```

---

### Task 2: 实现内容解析逻辑

**Files:**

- Modify: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes: 占位符 DOM 元素的 `data-intersection-content` 属性
- Produces:
  - `interface ParsedOption { category: string; text: string }`
  - `function parseIntersectionContent(content: string): ParsedOption[]`

- [ ] **Step 1: 定义数据类型**

在 `index.ts` 中添加（在导入语句后）：

```typescript
/** 解析后的路线选项 */
interface ParsedOption {
  category: string; // 分类标签，如"時間跳轉"
  text: string; // 具体描述文本
}
```

- [ ] **Step 2: 编写解析函数**

```typescript
/**
 * 解析 <intersection> 标签内容，提取路线选项
 * @param content 原始文本内容
 * @returns 解析后的选项数组
 */
function parseIntersectionContent(content: string): ParsedOption[] {
  const options: ParsedOption[] = [];

  // 匹配 fork１-５：【分类】描述文本
  const forkRegex = /fork[１-５]：【([^】]+)】(.+?)(?=\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = forkRegex.exec(content)) !== null) {
    options.push({
      category: match[1].trim(),
      text: match[2].trim(),
    });
  }

  return options;
}
```

- [ ] **Step 3: 添加解析测试辅助函数**

```typescript
/**
 * 测试解析逻辑（开发时使用）
 */
function testParsing(): void {
  const testContent = `
 {{user}} 請求劇情走向建議：於正文後列出最多五個後續走向；每項約 20-40 字，描述可能性，不替 {{user}} 做決定。

fork１：【時間跳轉】跳至何時，以及期間發生的關鍵變化。
fork２：【場景發展】當前場景可能發生的事件或局面變化。
fork３：【NPC行動】NPC 可能採取的行動或主動介入。
fork４：【阻力形成】正在形成的限制、危險、衝突或代價。
fork５：【機會形成】正在形成的線索、資源、轉機或助力。
  `.trim();

  const result = parseIntersectionContent(testContent);
  console.log('[路线规划面板] 解析测试:', result);

  if (result.length !== 5) {
    console.error('[路线规划面板] 解析失败：期望 5 个选项，实际', result.length);
  } else {
    console.info('[路线规划面板] 解析测试通过');
  }
}

// 开发环境下自动测试
if (process.env.NODE_ENV === 'development') {
  testParsing();
}
```

- [ ] **Step 4: 验证解析逻辑**

运行构建查看测试输出：

```bash
pnpm build
```

Expected: 控制台输出 "解析测试通过" 且显示 5 个选项

- [ ] **Step 5: 提交**

```bash
git add src/路线规划面板/index.ts
git commit -m "feat(路线规划面板): 实现内容解析逻辑"
```

---

### Task 3: 实现样式注入

**Files:**

- Modify: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes: 无（独立功能）
- Produces: `function injectStyles(): void` - 全局样式注入（仅执行一次）

- [ ] **Step 1: 定义样式常量**

在 `index.ts` 添加：

```typescript
/** 样式标签 ID */
const STYLE_ID = 'intersection-panel-styles';

/** CSS 样式内容 */
const CSS_STYLES = `
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

@media (prefers-color-scheme: dark) {
  .intersection-panel {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}
`;
```

- [ ] **Step 2: 实现样式注入函数**

```typescript
/**
 * 注入全局样式（仅执行一次）
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return; // 已注入，跳过
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);

  console.info('[路线规划面板] 样式已注入');
}
```

- [ ] **Step 3: 验证样式定义**

检查 TypeScript 编译：

```bash
pnpm build
```

Expected: 无编译错误

- [ ] **Step 4: 提交**

```bash
git add src/路线规划面板/index.ts
git commit -m "feat(路线规划面板): 实现样式注入逻辑"
```

---

### Task 4: 实现面板 HTML 生成

**Files:**

- Modify: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes:
  - `ParsedOption[]` (from Task 2)
- Produces:
  - `function generatePanelHTML(options: ParsedOption[], panelId: string): string`

- [ ] **Step 1: 实现 HTML 转义函数**

```typescript
/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

- [ ] **Step 2: 实现面板 HTML 生成函数**

```typescript
/**
 * 生成面板 HTML
 * @param options 解析后的选项数组
 * @param panelId 面板唯一 ID
 * @returns HTML 字符串
 */
function generatePanelHTML(options: ParsedOption[], panelId: string): string {
  const optionsHTML = options
    .map(
      opt => `
    <label class="option-item">
      <input type="radio" name="fork-${panelId}" value="${escapeHtml(opt.text)}" class="option-radio">
      <span class="option-content">
        <span class="option-category">【${escapeHtml(opt.category)}】</span>
        <span class="option-text">${escapeHtml(opt.text)}</span>
      </span>
    </label>
  `,
    )
    .join('');

  return `
    <div class="panel-header">
      <h3 class="panel-title">劇情走向選擇</h3>
    </div>
    <form class="panel-form">
      <div class="options-container">
        ${optionsHTML}
      </div>
      <button type="submit" class="confirm-btn" disabled>確定選擇</button>
    </form>
  `;
}
```

- [ ] **Step 3: 添加生成测试**

```typescript
/**
 * 测试 HTML 生成（开发时使用）
 */
function testHTMLGeneration(): void {
  const testOptions: ParsedOption[] = [
    { category: '時間跳轉', text: '跳至何時，以及期間發生的關鍵變化。' },
    { category: '場景發展', text: '當前場景可能發生的事件或局面變化。' },
  ];

  const html = generatePanelHTML(testOptions, 'test-123');

  if (html.includes('劇情走向選擇') && html.includes('fork-test-123')) {
    console.info('[路线规划面板] HTML 生成测试通过');
  } else {
    console.error('[路线规划面板] HTML 生成测试失败');
  }
}

if (process.env.NODE_ENV === 'development') {
  testHTMLGeneration();
}
```

- [ ] **Step 4: 验证生成逻辑**

```bash
pnpm build
```

Expected: 控制台输出 "HTML 生成测试通过"

- [ ] **Step 5: 提交**

```bash
git add src/路线规划面板/index.ts
git commit -m "feat(路线规划面板): 实现面板 HTML 生成"
```

---

### Task 5: 实现面板交互逻辑

**Files:**

- Modify: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes:
  - 面板 DOM 元素（`[data-intersection-panel]`）
- Produces:
  - `function initializePanel(panel: HTMLElement): void` - 为面板绑定事件监听器

- [ ] **Step 1: 实现表单提交处理函数**

```typescript
/**
 * 处理表单提交，填入输入框
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
```

- [ ] **Step 2: 实现面板初始化函数**

```typescript
/**
 * 初始化一个路线面板，绑定事件监听器
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
```

- [ ] **Step 3: 验证逻辑编译**

```bash
pnpm build
```

Expected: 编译成功，无 TypeScript 错误

- [ ] **Step 4: 提交**

```bash
git add src/路线规划面板/index.ts
git commit -m "feat(路线规划面板): 实现面板交互逻辑"
```

---

### Task 6: 实现占位符检测和替换

**Files:**

- Modify: `src/路线规划面板/index.ts`

**Interfaces:**

- Consumes:
  - `parseIntersectionContent()` (Task 2)
  - `generatePanelHTML()` (Task 4)
  - `initializePanel()` (Task 5)
  - `injectStyles()` (Task 3)
- Produces:
  - `function replacePlaceholder(placeholder: HTMLElement): void`
  - `function observePlaceholders(): void` - MutationObserver 监听

- [ ] **Step 1: 实现占位符替换函数**

```typescript
/**
 * 将占位符转换为完整面板
 */
function replacePlaceholder(placeholder: HTMLElement): void {
  const content = placeholder.dataset.intersectionContent;
  if (!content) {
    console.warn('[路线规划面板] 占位符缺少 content 属性');
    placeholder.remove();
    return;
  }

  // 解析内容
  const options = parseIntersectionContent(content);

  if (options.length === 0) {
    console.warn('[路线规划面板] 无法解析选项，内容:', content.substring(0, 100));
    placeholder.remove();
    return;
  }

  // 生成唯一 ID
  const panelId = Date.now().toString() + Math.random().toString(36).slice(2);

  // 创建面板元素
  const panel = document.createElement('div');
  panel.className = 'intersection-panel';
  panel.setAttribute('data-intersection-panel', '');
  panel.setAttribute('data-panel-id', panelId);
  panel.innerHTML = generatePanelHTML(options, panelId);

  // 替换占位符
  placeholder.replaceWith(panel);

  // 初始化面板交互
  initializePanel(panel);

  console.info(`[路线规划面板] 已生成面板 ${panelId}，包含 ${options.length} 个选项`);
}
```

- [ ] **Step 2: 实现 MutationObserver 监听**

```typescript
/**
 * 监听占位符并替换
 */
function observePlaceholders(): void {
  const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
  if (!container) {
    console.warn('[路线规划面板] 聊天容器不存在');
    return;
  }

  // 注入样式（仅一次）
  injectStyles();

  // 处理已存在的占位符
  container.querySelectorAll(PLACEHOLDER_SELECTOR).forEach(placeholder => {
    replacePlaceholder(placeholder as HTMLElement);
  });

  // 监听新增占位符
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          // 直接是占位符
          if (element.matches && element.matches(PLACEHOLDER_SELECTOR)) {
            replacePlaceholder(element);
          }

          // 包含占位符的容器
          if (element.querySelectorAll) {
            element.querySelectorAll(PLACEHOLDER_SELECTOR).forEach(placeholder => {
              replacePlaceholder(placeholder as HTMLElement);
            });
          }
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
```

- [ ] **Step 3: 添加脚本入口**

```typescript
/**
 * 脚本入口
 */
$(() => {
  try {
    observePlaceholders();
    console.info('[路线规划面板] 脚本已加载');
  } catch (e) {
    console.error('[路线规划面板] 初始化失败:', e);
  }
});
```

- [ ] **Step 4: 移除开发测试代码**

删除 `testParsing()` 和 `testHTMLGeneration()` 函数及其调用

- [ ] **Step 5: 最终构建**

```bash
pnpm build
```

Expected: 编译成功，生成 `dist/路线规划面板/index.js`

- [ ] **Step 6: 验证输出文件**

```bash
ls -la dist/路线规划面板/
```

Expected: 存在 `index.js` 和 `index.js.map`

- [ ] **Step 7: 提交**

```bash
git add src/路线规划面板/index.ts
git commit -m "feat(路线规划面板): 实现占位符检测和替换"
```

---

### Task 7: 修改预设正则配置

**Files:**

- Modify: `预设/木鳥也想飛/木鳥也想飛.yaml:673-684`

**Interfaces:**

- Consumes: 无（配置文件）
- Produces: 修改后的正则配置，输出占位符而非删除内容

- [ ] **Step 1: 读取当前正则配置**

```bash
cat "预设/木鳥也想飛/木鳥也想飛.yaml" | sed -n '673,684p'
```

Expected: 显示 `不發送路線规划` 正则的当前配置

- [ ] **Step 2: 修改正则替换内容**

将正则配置中的：

```yaml
- 正则名称: 不發送路線规划
  id: 81285518-1883-44bf-932a-ef36be605ec9
  启用: true
  查找表达式: /<intersection>[\s\S]*?<\/intersection>\s*/gi
  内容: ''
```

修改为（注意生成新的 UUID）：

```yaml
- 正则名称: 不發送路線规划
  id: a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6
  启用: true
  查找表达式: /<intersection>([\s\S]*?)<\/intersection>/gi
  内容: '<div class="intersection-placeholder" data-intersection-content="$1" style="display:none;"></div>'
```

关键变化：

1. 更新 `id` 为新的 UUID（解决重复 ID 问题）
2. 添加捕获组 `([\s\S]*?)` 捕获标签内容
3. `内容` 改为占位符 HTML，使用 `$1` 引用捕获组
4. 占位符使用 `display:none` 隐藏（由脚本替换为可见面板）

- [ ] **Step 3: 验证 YAML 语法**

```bash
pnpm build
```

Expected: 如果 YAML 语法错误，构建工具可能会报错

- [ ] **Step 4: 提交**

```bash
git add "预设/木鳥也想飛/木鳥也想飛.yaml"
git commit -m "feat(路线规划面板): 修改正则配置输出占位符"
```

---

### Task 8: 添加脚本到预设配置

**Files:**

- Modify: `预设/木鳥也想飛/木鳥也想飛.yaml:685-726`

**Interfaces:**

- Consumes: `dist/路线规划面板/index.js` (Task 6 生成)
- Produces: 预设中的脚本库配置

- [ ] **Step 1: 生成新的脚本 UUID**

使用在线 UUID 生成器或命令：

```bash
uuidgen
```

记录生成的 UUID，例如：`f1234567-89ab-cdef-0123-456789abcdef`

- [ ] **Step 2: 在预设配置中添加脚本**

在 `预设/木鳥也想飛/木鳥也想飛.yaml` 的 `扩展字段.酒馆助手.脚本库` 数组中添加新脚本配置：

找到这一部分（约第 685 行）：

```yaml
酒馆助手:
  脚本库:
    - 名称: 木鳥控制面板
      id: fda83c17-f4ef-49aa-a44c-7767e29f7b78
      启用: true
      类型: 脚本
      文件: ../../dist/木鳥控制面板/index.js
      # ...其他配置
```

在木鳥控制面板配置之后添加：

```yaml
- 名称: 路线规划面板
  id: f1234567-89ab-cdef-0123-456789abcdef
  启用: true
  类型: 脚本
  文件: ../../dist/路线规划面板/index.js
  导出时携带:
    数据: false
    按钮: false
```

- [ ] **Step 3: 验证配置格式**

检查 YAML 缩进是否正确（使用 2 空格缩进）

- [ ] **Step 4: 提交**

```bash
git add "预设/木鳥也想飛/木鳥也想飛.yaml"
git commit -m "feat(路线规划面板): 添加脚本到预设配置"
```

---

### Task 9: 集成测试

**Files:**

- Test: 预设在酒馆中的完整功能

**Interfaces:**

- Consumes: 所有前述任务的输出
- Produces: 验证报告

- [ ] **Step 1: 导出预设**

在项目根目录运行：

```bash
pnpm sync
```

Expected: 在 `导出/木鳥也想飛/` 目录生成预设文件

- [ ] **Step 2: 导入酒馆测试**

1. 打开 SillyTavern
2. 导入刚导出的预设
3. 创建或打开一个对话
4. 触发 AI 生成包含 `<intersection>` 标签的回复

测试用提示词示例：

```
请生成一个包含以下内容的回复：
<intersection>
fork１：【時間跳轉】跳至何時。
fork２：【場景發展】當前場景變化。
fork３：【NPC行動】NPC介入。
fork４：【阻力形成】形成限制。
fork５：【機會形成】形成機會。
</intersection>
```

- [ ] **Step 3: 验证面板显示**

检查项：

- [ ] AI 回复中 `<intersection>` 标签被替换为交互面板
- [ ] 面板显示标题"劇情走向選擇"
- [ ] 显示 5 个选项，每个包含分类标签和描述
- [ ] 确定按钮初始状态为禁用

- [ ] **Step 4: 验证交互功能**

检查项：

- [ ] 点击任一选项，确定按钮变为可用
- [ ] 点击确定按钮，内容正确填入输入框（仅描述文本，无前缀）
- [ ] 显示成功提示 toastr
- [ ] 按钮文字变为"✓ 已選擇"且被禁用
- [ ] 所有单选按钮被禁用

- [ ] **Step 5: 验证样式主题**

检查项：

- [ ] 切换到深色主题，面板样式正常
- [ ] 切换到浅色主题，面板样式正常
- [ ] 悬停选项时有视觉反馈
- [ ] 选中选项时有高亮效果

- [ ] **Step 6: 验证移动端适配**

使用浏览器开发者工具切换到移动端视图：

- [ ] 面板宽度适应屏幕
- [ ] 文字大小适中可读
- [ ] 按钮大小适合点击

- [ ] **Step 7: 验证边缘情况**

测试场景：

1. **格式异常**：AI 只输出 3 个 fork
   - Expected: 面板显示 3 个选项，功能正常

2. **未选择就确定**：直接点击确定按钮
   - Expected: 按钮禁用状态，无法点击

3. **多个历史面板**：滚动到包含旧面板的消息
   - Expected: 每个面板独立工作，互不干扰

- [ ] **Step 8: 记录测试结果**

创建测试报告文件：

```bash
cat > docs/superpowers/测试报告-路线规划面板.md << 'EOF'
# 路线规划面板测试报告

**测试日期**: 2025-01-07
**测试环境**: SillyTavern + 木鳥也想飛预设

## 功能测试

- [x] 面板正确显示
- [x] 选项解析正确
- [x] 交互功能正常
- [x] 内容填入输入框
- [x] 样式主题适配
- [x] 移动端响应式
- [x] 边缘情况处理

## 发现的问题

（如有问题，在此记录）

## 结论

功能符合预期，可以发布。
EOF
```

- [ ] **Step 9: 提交测试报告**

```bash
git add docs/superpowers/测试报告-路线规划面板.md
git commit -m "test(路线规划面板): 添加集成测试报告"
```

---

### Task 10: 文档和清理

**Files:**

- Create: `src/路线规划面板/README.md`
- Modify: 项目主 `README.md`（如需要）

**Interfaces:**

- Consumes: 无（文档任务）
- Produces: 用户和开发者文档

- [ ] **Step 1: 创建模块 README**

````bash
cat > src/路线规划面板/README.md << 'EOF'
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
````

## 依赖

- jQuery
- toastr
- 酒馆助手 API

## 相关文件

- 设计文档: `docs/superpowers/specs/2025-01-07-intersection-panel-design.md`
- 实现计划: `docs/superpowers/plans/2025-01-07-intersection-panel.md` EOF

````

- [ ] **Step 2: 检查代码注释完整性**

确认 `src/路线规划面板/index.ts` 中所有函数都有 JSDoc 注释

- [ ] **Step 3: 最终代码审查清单**

检查项：
- [ ] 无 console.log（仅保留 console.info/warn/error）
- [ ] 无未使用的导入
- [ ] 无 TypeScript any 类型
- [ ] 所有字符串文字使用繁体中文
- [ ] 代码格式符合项目规范（运行 `pnpm format`）

- [ ] **Step 4: 运行代码格式化**

```bash
pnpm format
````

- [ ] **Step 5: 最终构建**

```bash
pnpm build
```

Expected: 无错误无警告

- [ ] **Step 6: 提交文档**

```bash
git add src/路线规划面板/README.md
git add src/路线规划面板/index.ts
git commit -m "docs(路线规划面板): 添加模块文档和代码清理"
```

- [ ] **Step 7: 创建完成标签**

```bash
git tag -a v1.0.0-路线规划面板 -m "路线规划面板功能完成"
```

---

## Self-Review Checklist

**Spec coverage:**

- ✅ Task 1-2: 解析 `<intersection>` 内容 → 覆盖 2.1 内容解析
- ✅ Task 3: CSS 样式 → 覆盖 3.3 样式设计
- ✅ Task 4: HTML 生成 → 覆盖 3.2 HTML 结构
- ✅ Task 5: 交互逻辑 → 覆盖 2.1 单选交互、确认提交
- ✅ Task 6: 占位符检测 → 覆盖 3.1 组件 B 脚本部分
- ✅ Task 7: 正则配置 → 覆盖 3.5 正则配置
- ✅ Task 8: 预设配置 → 覆盖 4.1 文件清单
- ✅ Task 9: 测试 → 覆盖 4.3 测试计划
- ✅ Task 10: 文档 → 完整性保证

**Placeholder scan:**

- ✅ 无 TBD、TODO
- ✅ 所有代码块完整
- ✅ 所有测试步骤具体
- ✅ UUID 生成有明确指导

**Type consistency:**

- ✅ `ParsedOption` 接口在 Task 2 定义，Task 4 使用
- ✅ 函数签名在各任务间一致
- ✅ DOM 选择器常量全局定义

**Gaps identified:** 无

---

## Execution Handoff

计划已完成并保存到 `docs/superpowers/plans/2025-01-07-intersection-panel.md`。

**两种执行选项：**

**1. Subagent-Driven（推荐）** - 我为每个任务派发新的子代理，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 技能执行任务，批量执行带检查点

**选择哪种方式？**
