/**
 * 小雅嫉妒事件监听器 v1.1.0
 * 监听谭尧亲密度50-55区间触发小雅偏执嫉妒事件
 * 事件持续进行直到亲密度达到59时结束
 * 与现有数值监听器系统兼容，专注于事件触发和持续逻辑
 */

// 配置常量
const XIAOYA_EVENT_CONFIG = {
  // 监听的属性
  WATCH_ATTRIBUTE: '亲密度',

  // 触发区间
  TRIGGER_MIN: 50, // 触发最小值
  TRIGGER_MAX: 55, // 触发最大值
  EVENT_END: 59, // 事件结束值

  // 存储键
  STORAGE_KEY: 'xiaoYa_jealousy_event_state',

  // 事件相关设置
  EVENT_NAME: '小雅偏执嫉妒事件',
  EVENT_SOURCE: 'src/世界书/譚堯/小雅嫉妒事件.md',

  // 调试模式
  DEBUG_MODE: true,
};

// 全局状态
let isInitialized = false;
let eventState = null;

/**
 * 日志输出函数
 */
function log(level, message, ...args) {
  if (!XIAOYA_EVENT_CONFIG.DEBUG_MODE && level === 'info') return;

  const prefix = '[小雅事件监听器]';
  const timestamp = new Date().toLocaleTimeString();
  const fullMessage = `${prefix} ${timestamp} ${message}`;

  switch (level) {
    case 'info':
      console.log(fullMessage, ...args);
      break;
    case 'warn':
      console.warn(fullMessage, ...args);
      break;
    case 'error':
      console.error(fullMessage, ...args);
      break;
  }
}

/**
 * 获取谭尧亲密度当前值
 */
function getIntimacyValue() {
  try {
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
    const variablePath = `谭尧.${XIAOYA_EVENT_CONFIG.WATCH_ATTRIBUTE}`;
    const value = Mvu.getMvuVariable(mvuData, variablePath);
    return typeof value === 'number' ? value : 0;
  } catch (error) {
    log('error', '获取亲密度失败:', error);
    return 0;
  }
}

/**
 * 检查是否是新聊天
 */
function isNewChat() {
  try {
    // 检查聊天ID是否存在且变化
    const currentChatId = getCurrentChatId();
    const lastChatId = localStorage.getItem(`${XIAOYA_EVENT_CONFIG.STORAGE_KEY}_chat_id`);

    if (!currentChatId) {
      log('info', '无法获取聊天ID，假设为新聊天');
      return true;
    }

    if (currentChatId !== lastChatId) {
      log('info', `检测到新聊天: ${lastChatId} -> ${currentChatId}`);
      localStorage.setItem(`${XIAOYA_EVENT_CONFIG.STORAGE_KEY}_chat_id`, currentChatId);
      return true;
    }

    return false;
  } catch (error) {
    log('warn', '检查新聊天失败，默认为新聊天:', error);
    return true;
  }
}

/**
 * 初始化事件状态
 */
function initializeEventState() {
  log('info', '正在初始化事件状态...');

  // 检查是否是新聊天
  const isNew = isNewChat();

  if (isNew) {
    log('info', '检测到新聊天，创建全新的事件状态');
    createNewEventState();
  } else {
    // 尝试从 localStorage 加载状态
    const savedState = localStorage.getItem(XIAOYA_EVENT_CONFIG.STORAGE_KEY);

    if (savedState) {
      try {
        eventState = JSON.parse(savedState);
        log('info', '成功从存储中加载事件状态:', eventState);
      } catch (error) {
        log('warn', '加载存储状态失败，创建新状态:', error);
        createNewEventState();
      }
    } else {
      log('info', '未找到已保存的状态，创建新状态');
      createNewEventState();
    }
  }

  // 更新当前亲密度值
  eventState.currentIntimacy = getIntimacyValue();
  eventState.lastCheckTime = new Date().toISOString();

  saveEventState();
  log('info', '事件状态初始化完成:', eventState);
}

/**
 * 创建新的事件状态
 */
function createNewEventState() {
  const currentIntimacy = getIntimacyValue();

  eventState = {
    // 事件触发状态
    eventTriggered: false,
    eventActive: false, // 事件是否正在进行中
    triggeredTime: null,
    eventEndTime: null, // 事件结束时间

    // 亲密度跟踪
    currentIntimacy: currentIntimacy,
    lastCheckTime: new Date().toISOString(),

    // 统计信息
    checkCount: 0,
    triggerAttempts: 0,
    endAttempts: 0, // 结束尝试次数

    // 版本信息
    version: '1.1.0',
    createdTime: new Date().toISOString(),
  };

  log('info', '创建新的事件状态:', eventState);
}

/**
 * 保存事件状态
 */
function saveEventState() {
  try {
    const stateString = JSON.stringify(eventState);
    localStorage.setItem(XIAOYA_EVENT_CONFIG.STORAGE_KEY, stateString);
    log('info', '事件状态保存成功');
  } catch (error) {
    log('error', '保存事件状态失败:', error);
  }
}

/**
 * 检查是否满足事件触发条件
 */
function checkTriggerConditions(oldValue, newValue) {
  log('info', `🔍 检查触发条件: 亲密度 ${oldValue} -> ${newValue}`);

  // 条件1：事件未曾触发过
  if (eventState.eventTriggered) {
    log('info', '❌ 事件已经触发过，跳过');
    return false;
  }

  // 条件2：亲密度达到或进入触发区间 (50-55)
  // 支持三种情况：
  // 1. 从小于50进入50-55区间
  // 2. 当前值就在50-55区间内（初始化时检查）
  // 3. 从49跳跃到50-55区间
  const inTriggerRange = newValue >= XIAOYA_EVENT_CONFIG.TRIGGER_MIN && newValue <= XIAOYA_EVENT_CONFIG.TRIGGER_MAX;
  const wasBeforeRange = oldValue < XIAOYA_EVENT_CONFIG.TRIGGER_MIN;
  const isInitialCheck = oldValue === newValue; // 初始化时oldValue等于newValue

  if (inTriggerRange && (wasBeforeRange || isInitialCheck)) {
    log(
      'info',
      `✅ 满足触发条件：亲密度在触发区间 [${XIAOYA_EVENT_CONFIG.TRIGGER_MIN}, ${XIAOYA_EVENT_CONFIG.TRIGGER_MAX}]`,
    );
    log('info', `触发原因: ${isInitialCheck ? '初始检查发现在触发区间' : '从' + oldValue + '进入触发区间'}`);
    return true;
  }

  if (!inTriggerRange) {
    log(
      'info',
      `❌ 不满足触发条件：亲密度${newValue}不在触发区间[${XIAOYA_EVENT_CONFIG.TRIGGER_MIN}, ${XIAOYA_EVENT_CONFIG.TRIGGER_MAX}]`,
    );
  } else {
    log('info', `❌ 不满足触发条件：亲密度${newValue}在区间内但不是首次到达（从${oldValue}变化）`);
  }

  return false;
}

/**
 * 检查是否满足事件结束条件
 */
function checkEndConditions(oldValue, newValue) {
  log('info', `🔍 检查结束条件: 亲密度 ${oldValue} -> ${newValue}`);

  // 条件1：事件必须正在进行中
  if (!eventState.eventActive) {
    return false;
  }

  // 条件2：亲密度达到结束值
  if (newValue >= XIAOYA_EVENT_CONFIG.EVENT_END) {
    log('info', `✅ 满足结束条件：亲密度达到结束值 ${XIAOYA_EVENT_CONFIG.EVENT_END}`);
    return true;
  }

  return false;
}

/**
 * 触发小雅嫉妒事件
 */
async function triggerJealousyEvent(intimacyValue) {
  log('info', '🚨 开始触发小雅嫉妒事件...');

  try {
    eventState.triggerAttempts++;

    // 写入事件状态到 MVU 变量（让 AI 能看到）
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
    _.set(mvuData, 'stat_data.谭尧.小雅嫉妒事件已触发', true);
    _.set(mvuData, 'stat_data.谭尧.小雅危险等级', '极高');
    _.set(mvuData, 'stat_data.谭尧.当前威胁', '小雅策划报复行动');
    _.set(mvuData, 'stat_data.谭尧.事件触发时亲密度', intimacyValue);
    await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: -1 });

    // 注入绿灯触发词 - 不发给AI但可以激活世界书条目
    const triggerPrompt = {
      id: 'xiaoya_jealousy_trigger',
      position: 'none',
      depth: 0,
      role: 'system',
      content: '激活小雅嫉妒事件',
      should_scan: true,
    };

    injectPrompts([triggerPrompt], { once: false });
    log('info', '✅ 已注入绿灯触发词：激活小雅嫉妒事件');

    // 更新事件状态
    eventState.eventTriggered = true;
    eventState.eventActive = true; // 事件开始进行
    eventState.triggeredTime = new Date().toISOString();
    eventState.triggerIntimacy = intimacyValue;

    saveEventState();

    log('info', '✅ 小雅嫉妒事件触发成功');
    log('info', `📊 触发时亲密度: ${intimacyValue}`);
    log('info', `⏰ 触发时间: ${eventState.triggeredTime}`);
    log('info', '🎭 事件开始进行，将持续到亲密度达到59');

    // 静默触发，不显示弹窗提示

    // 触发成功事件回调
    onEventTriggered(intimacyValue);
  } catch (error) {
    log('error', '❌ 触发事件失败:', error);

    // 错误时仅记录日志，不显示弹窗
  }
}

/**
 * 结束小雅嫉妒事件
 */
async function endJealousyEvent(intimacyValue) {
  log('info', '🎬 结束小雅嫉妒事件...');

  try {
    eventState.endAttempts++;

    // 移除绿灯触发词
    uninjectPrompts(['xiaoya_jealousy_trigger']);
    log('info', '❌ 已移除绿灯触发词：激活小雅嫉妒事件');

    // 写入事件结束状态到 MVU 变量
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
    _.set(mvuData, 'stat_data.谭尧.小雅危险等级', '降低');
    _.set(mvuData, 'stat_data.谭尧.当前威胁', '事件已结束，但需保持警惕');
    _.set(mvuData, 'stat_data.谭尧.小雅嫉妒事件结束', true);
    _.set(mvuData, 'stat_data.谭尧.事件结束时亲密度', intimacyValue);
    await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: -1 });

    // 更新事件状态
    eventState.eventActive = false;
    eventState.eventEndTime = new Date().toISOString();

    saveEventState();

    log('info', '✅ 小雅嫉妒事件已结束');
    log('info', `📊 结束时亲密度: ${intimacyValue}`);
    log('info', `⏰ 结束时间: ${eventState.eventEndTime}`);
    log('info', '🎭 事件剧情完结，危险等级降低');

    // 静默结束，不显示弹窗提示

    // 结束成功事件回调
    onEventEnded(intimacyValue);
  } catch (error) {
    log('error', '❌ 结束事件失败:', error);

    // 错误时仅记录日志，不显示弹窗
  }
}

/**
 * 事件触发成功回调
 */
function onEventTriggered(intimacyValue) {
  log('info', '🎭 小雅嫉妒事件已激活');
  log('info', '📖 事件描述: 小雅因嫉妒谭尧对用户的特殊态度而产生偏执想法');
  log('info', '⚠️  危险等级: 极高 - 用户可能面临人身安全威胁');
  log('info', '🎯 剧情意义: 重要转折点，推动保护情节发展');
  log('info', `🔄 事件将持续到亲密度达到 ${XIAOYA_EVENT_CONFIG.EVENT_END}`);

  // 可以在这里添加额外的事件处理逻辑
  // 例如：发送通知、记录日志、触发其他系统等
}

/**
 * 事件结束成功回调
 */
function onEventEnded(intimacyValue) {
  log('info', '🎬 小雅嫉妒事件剧情完结');
  log('info', '📖 结局描述: 随着关系深化，小雅的嫉妒情绪得到缓解');
  log('info', '💚 危险等级: 降低 - 威胁基本解除，但需继续关注');
  log('info', '🎯 剧情发展: 进入新的故事阶段');

  // 可以在这里添加事件结束后的处理逻辑
}

/**
 * 处理亲密度变化
 */
async function handleIntimacyChange(stat_data, newValue, oldValue) {
  if (!isInitialized) {
    return;
  }

  // 更新统计
  eventState.checkCount++;
  eventState.currentIntimacy = newValue;
  eventState.lastCheckTime = new Date().toISOString();

  log('info', `📊 亲密度变化: ${oldValue} -> ${newValue} (检查次数: ${eventState.checkCount})`);

  // 优先检查事件结束条件
  if (checkEndConditions(oldValue, newValue)) {
    // 结束事件
    await endJealousyEvent(newValue);
  } else if (checkTriggerConditions(oldValue, newValue)) {
    // 触发事件
    await triggerJealousyEvent(newValue);
  } else if (!eventState.eventTriggered) {
    // 未触发但值得注意的变化
    if (newValue >= 45 && oldValue < 45) {
      log('info', '⚠️  警告：亲密度接近触发区间');
      // 静默记录，不显示弹窗
    }
  } else if (eventState.eventActive) {
    // 事件进行中的状态提示
    log('info', `🎭 小雅嫉妒事件进行中 (当前: ${newValue}/${XIAOYA_EVENT_CONFIG.EVENT_END})`);
    if (newValue >= 56 && oldValue < 56) {
      log('info', '🔄 事件即将结束，亲密度接近结束阈值');
      // 静默记录即将结束，不显示弹窗
    }
  }

  // 保存状态
  saveEventState();
}

/**
 * 设置变量监听器
 */
function setupVariableListeners() {
  log('info', '开始设置变量监听器...');

  // 监听 MVU 单个变量更新事件
  eventOn(Mvu.events.SINGLE_VARIABLE_UPDATED, (stat_data, path, old_value, new_value) => {
    // 检查是否是谭尧亲密度变化
    const expectedPath = `谭尧.${XIAOYA_EVENT_CONFIG.WATCH_ATTRIBUTE}`;

    if (path === expectedPath && typeof new_value === 'number' && typeof old_value === 'number') {
      handleIntimacyChange(stat_data, new_value, old_value);
    }
  });

  log('info', '✅ 变量监听器设置完成');
}

/**
 * 获取当前事件状态（调试用）
 */
function getCurrentEventStatus() {
  const currentIntimacy = getIntimacyValue();
  const status = {
    事件状态: eventState,
    当前亲密度: currentIntimacy,
    触发区间: `${XIAOYA_EVENT_CONFIG.TRIGGER_MIN}-${XIAOYA_EVENT_CONFIG.TRIGGER_MAX}`,
    结束阈值: XIAOYA_EVENT_CONFIG.EVENT_END,
    距离触发: eventState.eventTriggered ? '已触发' : Math.max(0, XIAOYA_EVENT_CONFIG.TRIGGER_MIN - currentIntimacy),
    距离结束: eventState.eventActive ? Math.max(0, XIAOYA_EVENT_CONFIG.EVENT_END - currentIntimacy) : '事件未激活',
    事件配置: XIAOYA_EVENT_CONFIG,
  };

  log('info', '📊 当前事件状态:', status);
  return status;
}

/**
 * 手动触发事件测试（调试用）
 */
async function manualTriggerTest() {
  log('info', '🧪 手动触发事件测试');

  if (eventState.eventTriggered) {
    log('warn', '事件已经触发过，无法重复触发');
    return false;
  }

  const currentIntimacy = getIntimacyValue();
  log('info', `当前亲密度: ${currentIntimacy}`);

  // 模拟触发条件
  await triggerJealousyEvent(currentIntimacy);
  return true;
}

/**
 * 手动结束事件测试（调试用）
 */
async function manualEndTest() {
  log('info', '🧪 手动结束事件测试');

  if (!eventState.eventActive) {
    log('warn', '事件未在进行中，无法结束');
    return false;
  }

  const currentIntimacy = getIntimacyValue();
  log('info', `当前亲密度: ${currentIntimacy}`);

  // 模拟结束条件
  await endJealousyEvent(currentIntimacy);
  return true;
}

/**
 * 重置事件状态（调试用）
 */
async function resetEventState() {
  log('info', '🔄 重置事件状态');
  createNewEventState();

  // 清除相关变量
  try {
    // 清除绿灯触发词（如果存在）
    uninjectPrompts(['xiaoya_jealousy_trigger']);
    log('info', '🧹 已清除绿灯触发词');

    // 重置 MVU 变量中的事件状态
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
    _.set(mvuData, 'stat_data.谭尧.小雅嫉妒事件已触发', false);
    _.set(mvuData, 'stat_data.谭尧.小雅危险等级', '无');
    _.set(mvuData, 'stat_data.谭尧.当前威胁', '无');
    _.set(mvuData, 'stat_data.谭尧.事件触发时亲密度', 0);
    _.set(mvuData, 'stat_data.谭尧.小雅嫉妒事件结束', false);
    _.set(mvuData, 'stat_data.谭尧.事件结束时亲密度', 0);
    await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: -1 });

    log('info', '✅ 事件状态已重置');
  } catch (error) {
    log('error', '重置变量时发生错误:', error);
  }
}

/**
 * 初始化脚本
 */
async function initialize() {
  if (isInitialized) {
    log('info', '⏸️ 已经初始化，跳过重复初始化');
    return;
  }

  log('info', '🚀 开始初始化小雅嫉妒事件监听器...');
  log('info', `版本: v${eventState?.version || '1.0.0'}`);
  log('info', '当前时间:', new Date().toLocaleString());

  try {
    // 等待 MVU 变量框架初始化
    log('info', '等待 MVU 变量框架初始化...');
    await waitGlobalInitialized('Mvu');
    log('info', '✅ MVU 变量框架初始化完成');

    // 初始化事件状态
    log('info', '初始化事件状态...');
    initializeEventState();

    // 设置变量监听器
    log('info', '设置变量监听器...');
    setupVariableListeners();

    isInitialized = true;

    // 暴露调试函数到全局作用域
    window.getXiaoYaEventStatus = getCurrentEventStatus;
    window.triggerXiaoYaEventTest = manualTriggerTest;
    window.endXiaoYaEventTest = manualEndTest;
    window.resetXiaoYaEvent = resetEventState;

    log('info', '✅ 小雅嫉妒事件监听器初始化完成');
    log('info', '🔧 调试函数已暴露到全局作用域:');
    log('info', '- getXiaoYaEventStatus() : 查看当前事件状态');
    log('info', '- triggerXiaoYaEventTest() : 手动触发事件测试');
    log('info', '- endXiaoYaEventTest() : 手动结束事件测试');
    log('info', '- resetXiaoYaEvent() : 重置事件状态');

    // 静默启动，不显示弹窗提示

    // 检查当前状态
    const currentIntimacy = getIntimacyValue();
    log(
      'info',
      `📊 当前谭尧亲密度: ${currentIntimacy} (触发区间: ${XIAOYA_EVENT_CONFIG.TRIGGER_MIN}-${XIAOYA_EVENT_CONFIG.TRIGGER_MAX}, 结束: ${XIAOYA_EVENT_CONFIG.EVENT_END})`,
    );

    if (eventState.eventActive) {
      log('info', '🎭 小雅嫉妒事件正在进行中');
      // 静默记录状态，不显示弹窗
    } else if (eventState.eventTriggered) {
      log('info', '✅ 小雅嫉妒事件已完结');
      // 静默记录状态，不显示弹窗
    } else if (
      currentIntimacy >= XIAOYA_EVENT_CONFIG.TRIGGER_MIN &&
      currentIntimacy <= XIAOYA_EVENT_CONFIG.TRIGGER_MAX
    ) {
      log('info', '🚨 发现亲密度在触发区间，执行初始化检查...');
      // 执行初始化触发检查
      if (checkTriggerConditions(currentIntimacy, currentIntimacy)) {
        await triggerJealousyEvent(currentIntimacy);
      }
    }
  } catch (error) {
    log('error', '❌ 初始化失败:', error);
    throw error;
  }
}

/**
 * 清理函数
 */
function cleanup() {
  log('info', '🧹 开始执行清理...');

  isInitialized = false;

  // 保存当前状态（如果事件正在进行中）
  if (eventState && eventState.eventActive) {
    log('info', '事件正在进行中，保存状态以供下次加载');
    saveEventState();
  }

  // 清理全局函数
  delete window.getXiaoYaEventStatus;
  delete window.triggerXiaoYaEventTest;
  delete window.endXiaoYaEventTest;
  delete window.resetXiaoYaEvent;

  log('info', '✅ 清理完成');
  log('info', '👋 小雅嫉妒事件监听器已卸载');
}

// 使用 jQuery 的文档就绪事件
$(function () {
  initialize().catch(error => {
    log('error', '❌ 脚本启动失败:', error);
  });
});

// 页面卸载时清理
$(window).on('beforeunload', function () {
  cleanup();
});
