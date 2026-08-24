import $ from 'jquery';
import toastr from 'toastr';

/** 面板选择器 */
const PANEL_SELECTOR = '[data-intersection-panel]';

/** 聊天消息容器选择器 */
const CHAT_CONTAINER_SELECTOR = '#chat, #sheld, .mes_block, body';

/** 酒馆输入框选择器 */
const INPUT_TEXTAREA_SELECTOR = '#send_textarea';

/**
 * 处理表单提交，填入输入框
 */
function handleSubmit(panel: HTMLElement): void {
  const form = panel.querySelector('.intersection-panel-form') as HTMLFormElement;
  if (!form) return;

  const radios = form.querySelectorAll('.intersection-option-radio') as NodeListOf<HTMLInputElement>;
  const confirmBtn = form.querySelector('.intersection-confirm-btn') as HTMLButtonElement;
  if (!radios.length || !confirmBtn) return;

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
  // 检查是否已初始化
  if (panel.dataset.initialized === 'true') {
    return;
  }

  const form = panel.querySelector('.intersection-panel-form') as HTMLFormElement;
  const confirmBtn = panel.querySelector('.intersection-confirm-btn') as HTMLButtonElement;
  const radios = panel.querySelectorAll('.intersection-option-radio') as NodeListOf<HTMLInputElement>;

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
    handleSubmit(panel);
  });

  // 标记为已初始化
  panel.dataset.initialized = 'true';

  console.info('[路线规划面板] 已初始化面板');
}

/**
 * 监听新增面板并初始化
 */
function observePanels(): void {
  const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
  if (!container) {
    console.warn('[路线规划面板] 聊天容器不存在，将在 1 秒后重试');
    setTimeout(observePanels, 1000);
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
          if (element.matches && element.matches(PANEL_SELECTOR)) {
            initializePanel(element);
          }

          // 包含面板的容器
          if (element.querySelectorAll) {
            element.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
              initializePanel(panel as HTMLElement);
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
    observePanels();
    console.info('[路线规划面板] 脚本已加载');
  } catch (e) {
    console.error('[路线规划面板] 初始化失败:', e);
  }
});
