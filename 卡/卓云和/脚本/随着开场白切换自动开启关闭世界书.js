// --- 脚本配置说明 ---
// SWIPE_ACTIONS 定义了每个swipe切换时需要设置的世界书条目状态。
// 键是swipe的索引（从0开始），值是一个包含UID和状态的数组。
// UID是世界书条目的唯一标识符，state为true表示开启，false表示关闭。

// --- 脚本配置开始 ---
const SWIPE_ACTIONS = {
  0: [ // 第 0 則開場白 (35歲)
    { name: "卓雲和", state: true },
    { name: "三十五岁的卓云和关键信息", state: true },
    { name: "十二岁卓云和角色祥情", state: false },
    { name: "十二岁卓云和关键信息", state: false },
  ],
  1: [ // 第 1 則開場白 (12歲)
    { name: "十二岁卓云和角色祥情", state: true },
    { name: "十二岁卓云和关键信息", state: true },
    { name: "卓雲和", state: false },
    { name: "三十五岁的卓云和关键信息", state: false },
  ],
};
// --- 脚本配置结束 ---

// 全局变量：用于追踪当前swipe状态
let currentSwipeIndex = -1;
let isInitialized = false;
let swipeMonitorInterval = <user>;

/**
 * 根据当前swipe索引更新世界书条目状态。
 * @param {number} swipeIndex 当前swipe的索引。
 */
async function updateWorldBookEntries(swipeIndex) {
  console.log(`准备更新世界书条目，swipe索引: ${swipeIndex}`);

  // 获取当前角色卡绑定的主要世界书
  const lorebookName = TavernHelper.getCurrentCharPrimaryLorebook();
  if (!lorebookName) {
    console.log('脚本提示：当前角色卡没有绑定的主要世界书，更新未执行。');
    toastr.info('当前角色卡没有绑定主要世界书，世界书条目更新未执行。');
    return;
  }

  // 检查是否有针对当前swipe索引的配置
  const swipeKey = swipeIndex.toString();
  if (!(swipeKey in SWIPE_ACTIONS)) {
    console.log(`脚本提示：swipe索引 ${swipeIndex} 没有配置动作，更新未执行。`);
    toastr.info(`swipe索引 ${swipeIndex} 没有配置动作，世界书条目更新未执行。`);
    return;
  }

  const actions = SWIPE_ACTIONS[swipeKey];
  if (actions.length === 0) {
    console.log(`脚本提示：swipe索引 ${swipeIndex} 的动作列表为空，更新未执行。`);
    toastr.info(`swipe索引 ${swipeIndex} 的动作列表为空，世界书条目更新未执行。`);
    return;
  }

  try {
    // 获取世界书中的所有条目
    const currentEntries = await TavernHelper.getLorebookEntries(lorebookName);
    if (!currentEntries) {
      toastr.error(`获取世界书 "${lorebookName}" 条目失败。请检查控制台。`);
      console.error(`获取世界书 "${lorebookName}" 条目失败。`);
      return;
    }

    const entriesToModify = [];
    for (const action of actions) {
      // 改用名稱 (comment) 來尋找對應的條目，不再依賴不可靠的 UID
      const existingEntry = currentEntries.find(e => e.comment === action.name);
      if (existingEntry) {
        if (existingEntry.enabled !== action.state) {
          entriesToModify.push({
            uid: Number(existingEntry.uid),
            enabled: action.state,
          });
          console.log(
            `世界书 "${lorebookName}" 中 [${existingEntry.comment}] 的条目状态将从 ${
              existingEntry.enabled ? '开启' : '关闭'
            } 切换为 ${action.state ? '开启' : '关闭'}。`,
          );
        } else {
          console.log(
            `世界书 "${lorebookName}" 中 [${existingEntry.comment}] 的条目状态已为 ${
              action.state ? '开启' : '关闭'
            }，无需更改。`,
          );
        }
      } else {
        console.warn(
          `世界书 "${lorebookName}" 中未找到名稱為 "${action.name}" 的条目。`,
        );
        toastr.warning(`世界书 "${lorebookName}" 中未找到 "${action.name}" 的条目。`);
      }
    }

    if (entriesToModify.length > 0) {
      await TavernHelper.setLorebookEntries(lorebookName, entriesToModify);
      toastr.success(`世界书 "${lorebookName}" 中 ${entriesToModify.length} 个条目状态已更新。`, '更新成功');
    } else {
      console.log('规则已匹配，但所有目标条目的当前状态均无需更改。');
      toastr.info('所有目标条目状态无需更改。');
    }
  } catch (error) {
    console.error('处理世界书条目时发生错误:', error);
    toastr.error('处理世界书条目时出错，详情请查看控制台。');
  }
}

/**
 * 获取当前选中的swipe索引
 * @returns {Promise<number>} 当前swipe索引
 */
async function getCurrentSwipeIndex() {
  try {
    // 获取第一条消息（通常是角色的开场白，包含swipes）
    const messages = await TavernHelper.getChatMessages(0, { include_swipe: true });
    if (!messages || !messages[0] || !messages[0].swipes) {
      console.log('无法获取消息或swipe信息');
      return -1;
    }

    const firstMessage = messages[0];
    const currentSwipeId = firstMessage.swipe_id || 0;
    return currentSwipeId;
  } catch (error) {
    console.error('获取当前swipe索引时出错:', error);
    return -1;
  }
}

/**
 * 监控swipe变化的函数
 * 这是核心优化：定期检查swipe是否发生变化，无论通过什么方式触发
 */
async function monitorSwipeChanges() {
  try {
    const newSwipeIndex = await getCurrentSwipeIndex();

    // 如果是第一次获取或者swipe发生了变化
    if (currentSwipeIndex !== newSwipeIndex && newSwipeIndex >= 0) {
      const oldIndex = currentSwipeIndex;
      currentSwipeIndex = newSwipeIndex;

      console.log(`检测到swipe变化: ${oldIndex} → ${newSwipeIndex}`);

      // 如果不是初始化时，则显示切换提示
      if (isInitialized && oldIndex >= 0) {
        toastr.info(`开场白已切换到索引 ${newSwipeIndex}`, '自动检测');
      }

      // 更新世界书条目
      await updateWorldBookEntries(newSwipeIndex);
    }
  } catch (error) {
    console.error('监控swipe变化时发生错误:', error);
  }
}

/**
 * 事件处理函数，用于处理swipe切换事件。
 * @param {number} messageId 切换swipe的消息ID
 */
async function handleMessageSwiped(messageId) {
  console.log(`捕获到消息swipe切换事件, 消息ID: ${messageId}`);

  // 只处理第一条消息的swipe切换
  if (messageId === 0) {
    // 立即检查一次swipe变化
    await monitorSwipeChanges();
  }
}

/**
 * 手动触发更新世界书条目（基于当前swipe）
 */
async function manuallyUpdateWorldBookEntries() {
  const swipeIndex = await getCurrentSwipeIndex();
  if (swipeIndex >= 0) {
    console.log(`手动触发更新，当前swipe索引: ${swipeIndex}`);
    await updateWorldBookEntries(swipeIndex);
  } else {
    console.error('无法获取当前swipe索引，无法手动更新世界书条目');
    toastr.error('无法获取当前swipe索引，手动更新失败');
  }
}

/**
 * 启动swipe监控器
 */
function startSwipeMonitor() {
  if (swipeMonitorInterval) {
    clearInterval(swipeMonitorInterval);
  }

  // 每500毫秒检查一次swipe变化
  swipeMonitorInterval = setInterval(monitorSwipeChanges, 500);
  console.log('Swipe监控器已启动，每500ms检查一次变化');
}

/**
 * 停止swipe监控器
 */
function stopSwipeMonitor() {
  if (swipeMonitorInterval) {
    clearInterval(swipeMonitorInterval);
    swipeMonitorInterval = <user>;
    console.log('Swipe监控器已停止');
  }
}

// 使用 TavernHelper.errorCatched 包装事件处理器，以便在发生错误时能通过酒馆通知显示
const safeHandleMessageSwiped = TavernHelper.errorCatched(handleMessageSwiped);
const safeManuallyUpdateWorldBookEntries = TavernHelper.errorCatched(manuallyUpdateWorldBookEntries);
const safeMonitorSwipeChanges = TavernHelper.errorCatched(monitorSwipeChanges);

// --- 事件监听器设置 ---
// 在脚本加载时执行
function onScriptLoad() {
  console.log('Swipe切换时控制世界书条目脚本已加载。');
  toastr.success('开场白自动切换脚本已激活，支持自动检测变化！', '脚本激活');

  // 显示所有条目的UID
  showAllEntryUIDs();

  // 监听消息swipe切换事件（保留原有功能）
  if (typeof eventOn === 'function' && typeof tavern_events === 'object' && tavern_events.MESSAGE_SWIPED) {
    eventOn(tavern_events.MESSAGE_SWIPED, async messageId => {
      await safeHandleMessageSwiped(messageId);
    });
    console.log('成功注册MESSAGE_SWIPED事件监听器');
  } else {
    console.warn('无法注册MESSAGE_SWIPED事件监听器，但自动监控仍可正常工作');
  }

  // 启动自动监控
  startSwipeMonitor();

  // 初始化时获取当前状态
  setTimeout(async () => {
    await safeMonitorSwipeChanges();
    isInitialized = true;
  }, 1000); // 延迟1秒执行，确保应用已完全加载
}

// 在脚本卸载时执行
function onScriptUnload() {
  console.log('Swipe切换时控制世界书条目脚本已卸载。');
  toastr.info('开场白自动切换脚本已停用。');

  // 停止监控器
  stopSwipeMonitor();

  // 重置状态
  currentSwipeIndex = -1;
  isInitialized = false;
}

/**
 * 获取并显示当前角色卡绑定的主要世界书中所有条目的UID和名称
 * 帮助用户确认正确的UID值
 */
async function showAllEntryUIDs() {
  const lorebookName = TavernHelper.getCurrentCharPrimaryLorebook();
  if (!lorebookName) {
    console.log('当前角色卡没有绑定主要世界书，无法显示条目UID。');
    toastr.info('当前角色卡没有绑定主要世界书，请先绑定世界书。');
    return;
  }

  try {
    const entries = await TavernHelper.getLorebookEntries(lorebookName);
    if (!entries || entries.length === 0) {
      console.log(`世界书"${lorebookName}"中没有找到任何条目。`);
      toastr.info(`世界书"${lorebookName}"中没有找到任何条目。`);
      return;
    }

    console.log(`======== 世界书"${lorebookName}"的所有条目UID ========`);
    entries.forEach(entry => {
      console.log(`UID: ${entry.uid}, 标题: ${entry.comment}, 当前状态: ${entry.enabled ? '开启' : '关闭'}`);
    });
    console.log(`======== 请使用以上UID值配置Swipe动作 ========`);

    // 在页面上显示提示
    toastr.info(`已在控制台输出世界书"${lorebookName}"的${entries.length}个条目UID信息，请按F12查看。`);
  } catch (error) {
    console.error('获取世界书条目信息时发生错误:', error);
    toastr.error('获取世界书条目信息失败，请查看控制台日志。');
  }
}

// 使用jQuery的文档就绪事件来初始化脚本
$(() => {
  console.log('文档已加载，开始初始化Swipe控制脚本...');
  onScriptLoad();
});

// 监听页面卸载事件
$(window).on('pagehide', () => {
  onScriptUnload();
});

// 导出加载和卸载函数，供酒馆助手调用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    onScriptLoad,
    onScriptUnload,
    manuallyUpdateWorldBookEntries,
    startSwipeMonitor,
    stopSwipeMonitor,
  };
}
