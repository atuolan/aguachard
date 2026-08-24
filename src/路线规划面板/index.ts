/** 占位符选择器 */
const PLACEHOLDER_SELECTOR = '.intersection-placeholder';

/** 面板选择器 */
const PANEL_SELECTOR = '[data-intersection-panel]';

/** 聊天消息容器选择器 */
const CHAT_CONTAINER_SELECTOR = '#chat';

/** 酒馆输入框选择器 */
const INPUT_TEXTAREA_SELECTOR = '#send_textarea';

/** 解析后的路线选项 */
interface ParsedOption {
  category: string; // 分类标签，如"時間跳轉"
  text: string; // 具体描述文本
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
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
  testParsing();
}

console.info('[路线规划面板] 脚本模块已加载');
