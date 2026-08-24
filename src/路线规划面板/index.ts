/** 占位符选择器 */
const PLACEHOLDER_SELECTOR = '.intersection-placeholder';

/** 面板选择器 */
const PANEL_SELECTOR = '[data-intersection-panel]';

/** 聊天消息容器选择器 */
const CHAT_CONTAINER_SELECTOR = '#chat';

/** 酒馆输入框选择器 */
const INPUT_TEXTAREA_SELECTOR = '#send_textarea';

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

/** 解析后的路线选项 */
interface ParsedOption {
  category: string; // 分类标签，如"時間跳轉"
  text: string; // 具体描述文本
}

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

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

/**
 * 监听占位符并替换
 */
function observePlaceholders(): void {
  const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
  if (!container) {
    console.warn('[路线规划面板] 聊天容器不存在，将在 1 秒后重试');
    setTimeout(observePlaceholders, 1000);
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
