/**
 * 卓云和每日数值变动限制
 * 好感度、戒备值、爱意值 每日累计变动（绝对值）不超过 4
 * 达到上限后当日锁定，直到日期变更才重置
 */

const DAILY_LIMIT = 4;
const STORAGE_KEY = 'zhuoyunhe_daily_limit_state';
const DAILY_ATTRIBUTES = ['好感度', '戒备值', '爱意值'];

function extractDate(variables) {
  return _.get(variables, 'stat_data.时间系统.日期', '');
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
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('[卓云和每日变动] 读取每日状态失败:', e);
  }
  return createFreshDailyState('');
}

function saveDailyState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');

    const dailyState = loadDailyState();

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
      const currentDate = extractDate(variables);

      // 日期变更则重置
      if (dailyState.lastDate !== currentDate) {
        console.info(`[卓云和每日变动] 新的一天: ${dailyState.lastDate} -> ${currentDate}，重置限制`);
        Object.assign(dailyState, createFreshDailyState(currentDate));
      }

      for (const attr of DAILY_ATTRIBUTES) {
        const attrState = dailyState.attributes[attr];
        const oldVal = _.get(variables_before_update, `stat_data.卓云和个人状态.${attr}`, 0);
        const newVal = _.get(variables, `stat_data.卓云和个人状态.${attr}`, 0);
        const delta = Math.abs(newVal - oldVal);

        if (delta === 0) continue;

        // 已锁定：恢复旧值
        if (attrState.isLocked) {
          _.set(variables, `stat_data.卓云和个人状态.${attr}`, oldVal);
          console.info(`[卓云和每日变动] ${attr} 今日已锁定，恢复为 ${oldVal}`);
          continue;
        }

        const remaining = DAILY_LIMIT - attrState.changeTotal;

        // 变动超出剩余额度：截断
        if (delta > remaining) {
          const direction = newVal > oldVal ? 1 : -1;
          const capped = oldVal + direction * remaining;
          _.set(variables, `stat_data.卓云和个人状态.${attr}`, capped);
          attrState.changeTotal = DAILY_LIMIT;
          attrState.isLocked = true;
          console.info(
            `[卓云和每日变动] ${attr} 变动 ${direction * delta} 超出剩余额度 ${remaining}，截断为 ${oldVal} -> ${capped}，今日锁定`,
          );
          continue;
        }

        attrState.changeTotal += delta;
        console.info(`[卓云和每日变动] ${attr} 变动 ${newVal - oldVal}，累计 ${attrState.changeTotal}/${DAILY_LIMIT}`);

        if (attrState.changeTotal >= DAILY_LIMIT) {
          attrState.isLocked = true;
          console.info(`[卓云和每日变动] ${attr} 达到每日限制，今日锁定`);
        }
      }

      saveDailyState(dailyState);
    });

    console.info('[卓云和每日变动] 脚本初始化完成');
  })();
});

$(window).on('pagehide', () => {
  console.info('[卓云和每日变动] 脚本已卸载');
});
