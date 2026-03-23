const Schema = z.object({
  世界: z
    .object({
      时间点: z.string().prefault('03月15日-星期三-春-上午-晴-09:00'),
    })
    .prefault({}),
  user: z
    .object({
      识破身份: z.enum(['未识破', '识破']).prefault('未识破'),
    })
    .prefault({}),
  '黎靖青/穷云海': z
    .object({
      认出聊天对象: z.enum(['未认出', '认出']).prefault('未认出'),
    })
    .prefault({}),
  黎靖青: z
    .object({
      目前身份: z.enum(['黎靖青', '穷云海']).prefault('黎靖青'),
      目前模式: z.enum(['上司', '伪娘', '私下状态', '恋人']).prefault('上司'),
      心情: z.string().prefault('冷静'),
      冷淡值: z.coerce
        .number()
        .prefault(100)
        .transform(v => _.clamp(v, 0, 100)),
      亲密值: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      兴奋值: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      内心想法: z.string().prefault(''),
      待办事项: z.string().prefault('无'),
    })
    .prefault({}),
  event_data: z
    .object({
      身份试探: z
        .object({
          进行中: z.boolean().prefault(false),
          已完成: z.boolean().prefault(false),
          消息进度: z.string().prefault('Not yet triggered'),
          识破状态: z.string().prefault(''),
          可直接询问: z.boolean().prefault(false),
        })
        .prefault({}),
    })
    .prefault({}),
});

/**
 * 黎靖青数值限制器（合并版）
 * 1. 每次变量更新的单次变动幅度限制（原數值檢測檢測功能）
 * 2. 每日变动累计总量限制
 *
 * 单次变动限制:
 *   冷淡值: ±3（穷云海身份: 完全锁定）
 *   亲密值: ±3（穷云海身份: ±1）
 *   兴奋值: ±5
 *
 * 每日累计限制:
 *   冷淡值、亲密值: 每日累计变动不超过 7
 */

// === 单次变动限制配置 ===
const PER_UPDATE_LIMITS = {
  冷淡值: { min: -2, max: 2 },
  亲密值: { min: -2, max: 2 },
  兴奋值: { min: -5, max: 5 },
};
const QIONG_YUNHAI_LIMITS = {
  冷淡值: { min: 0, max: 0 }, // 完全锁定
  亲密值: { min: -1, max: 1 },
};

// === 每日累计限制配置 ===
const DAILY_LIMIT = 7;
const DAILY_STORAGE_KEY = 'lijingqing_daily_limit_state';
const DAILY_ATTRIBUTES = ['冷淡值', '亲密值'];

function extractDate(timePoint) {
  const match = timePoint.match(/^(\d{2}月\d{2}日)/);
  return match ? match[1] : new Date().toISOString().split('T')[0];
}

function createFreshDailyState(date) {
  const attributes = {};
  for (const attr of DAILY_ATTRIBUTES) {
    attributes[attr] = { changeTotal: 0, isLocked: false };
  }
  return { lastDate: date, attributes };
}

function loadDailyState() {
  try {
    const saved = localStorage.getItem(DAILY_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('[每日变动] 读取每日状态失败:', e);
  }
  return createFreshDailyState('');
}

function saveDailyState(state) {
  localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
}

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');

    const dailyState = loadDailyState();

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
      const newData = Schema.parse(_.get(variables, 'stat_data', {}));
      const oldData = Schema.parse(_.get(variables_before_update, 'stat_data', {}));
      const identity = newData.黎靖青.目前身份;

      // ========== 0. 不可逆状态保护 ==========
      // 识破身份: 一旦「识破」不可退回「未识破」
      if (oldData.user.识破身份 === '识破' && newData.user.识破身份 !== '识破') {
        _.set(variables, 'stat_data.user.识破身份', '识破');
        console.info(`[每日变动] 识破身份不可逆，已阻止退回「${newData.user.识破身份}」`);
      }
      // 认出聊天对象: 一旦「认出」不可退回「未认出」
      if (oldData['黎靖青/穷云海'].认出聊天对象 === '认出' && newData['黎靖青/穷云海'].认出聊天对象 !== '认出') {
        _.set(variables, 'stat_data.黎靖青/穷云海.认出聊天对象', '认出');
        console.info(`[每日变动] 认出聊天对象不可逆，已阻止退回「${newData['黎靖青/穷云海'].认出聊天对象}」`);
      }

      // ========== 1. 单次变动幅度限制 ==========
      for (const attr of ['冷淡值', '亲密值', '兴奋值']) {
        const oldVal = oldData.黎靖青[attr];
        const newVal = newData.黎靖青[attr];
        const delta = newVal - oldVal;

        if (delta === 0) continue;

        // 获取限制: 穷云海身份有特殊限制
        const limits =
          identity === '穷云海' && QIONG_YUNHAI_LIMITS[attr] ? QIONG_YUNHAI_LIMITS[attr] : PER_UPDATE_LIMITS[attr];

        if (!limits) continue;

        const clampedDelta = _.clamp(delta, limits.min, limits.max);
        if (clampedDelta !== delta) {
          const corrected = oldVal + clampedDelta;
          _.set(variables, `stat_data.黎靖青.${attr}`, corrected);
          console.info(
            `[每日变动] ${attr} 单次变动 ${delta} 超限 [${limits.min},${limits.max}]，修正为 ${oldVal} -> ${corrected}`,
          );
        }
      }

      // ========== 2. 每日累计变动限制 ==========
      // 重新读取（可能已被步骤1修正）
      const correctedData = Schema.parse(_.get(variables, 'stat_data', {}));
      const currentDate = extractDate(correctedData.世界.时间点);

      if (dailyState.lastDate !== currentDate) {
        console.info(`[每日变动] 新的一天: ${dailyState.lastDate} -> ${currentDate}，重置限制`);
        Object.assign(dailyState, createFreshDailyState(currentDate));
      }

      for (const attr of DAILY_ATTRIBUTES) {
        const attrState = dailyState.attributes[attr];
        const oldVal = oldData.黎靖青[attr];
        const curVal = correctedData.黎靖青[attr];
        const delta = Math.abs(curVal - oldVal);

        if (delta === 0) continue;

        if (attrState.isLocked) {
          _.set(variables, `stat_data.黎靖青.${attr}`, oldVal);
          console.info(`[每日变动] ${attr} 每日已锁定，恢复为 ${oldVal}`);
          continue;
        }

        attrState.changeTotal += delta;
        console.info(`[每日变动] ${attr} 变动 ${delta}，累计 ${attrState.changeTotal}/${DAILY_LIMIT}`);

        if (attrState.changeTotal >= DAILY_LIMIT) {
          attrState.isLocked = true;
          console.info(`[每日变动] ${attr} 达到每日限制，已锁定`);
        }
      }

      saveDailyState(dailyState);
    });

    console.info('[每日变动] 脚本初始化完成（含单次变动限制 + 每日累计限制）');
  })();
});

$(window).on('pagehide', () => {
  console.info('[每日变动] 脚本已卸载');
});
