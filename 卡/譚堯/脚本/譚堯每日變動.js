/**
 * 谭尧每日变动限制器 v2.0.0
 * 控制谭尧的好感度、警惕值、亲密度、恶感度的每日变动次数上限
 * 范围限制(0-100)已由 schema 的 z.transform(_.clamp) 处理
 */

const CONFIG = {
  DAILY_LIMIT: 7,
  STORAGE_KEY: 'tanyao_daily_limit_state',
  ATTRIBUTES: ['好感度', '警惕值', '亲密度', '恶感度'],
  TIME_VARIABLE: '谭尧.时间',
};

let dailyLimitState;
const isInitialized = false;

function initializeDailyLimitState() {
  const savedState = localStorage.getItem(CONFIG.STORAGE_KEY);
  if (savedState) {
    try {
      dailyLimitState = JSON.parse(savedState);
    } catch (error) {
      createNewDailyLimitState();
    }
  } else {
    createNewDailyLimitState();
  }
  checkAndResetIfNewDay();
}

function createNewDailyLimitState() {
  dailyLimitState = {
    lastDate: getCurrentDate(),
    attributes: {},
  };
  CONFIG.ATTRIBUTES.forEach(function (attr) {
    dailyLimitState.attributes[attr] = {
      changeCount: 0,
      isLocked: false,
      lockedValue: <user>,
    };
  });
  saveDailyLimitState();
}

function getCurrentDate() {
  try {
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
    const timeValue = _.get(mvuData, 'stat_data.谭尧.时间');
    if (timeValue && typeof timeValue === 'string') {
      const dateMatch = timeValue.match(/^(\d{1,2}\/\d{1,2})/);
      if (dateMatch) {
        return new Date().getFullYear() + '-' + dateMatch[1].replace('/', '-');
      }
    }
  } catch (error) {
    // fallback to system date
  }
  return new Date().toISOString().split('T')[0];
}

function checkAndResetIfNewDay() {
  const currentDate = getCurrentDate();
  if (dailyLimitState.lastDate !== currentDate) {
    CONFIG.ATTRIBUTES.forEach(function (attr) {
      dailyLimitState.attributes[attr] = {
        changeCount: 0,
        isLocked: false,
        lockedValue: <user>,
      };
    });
    dailyLimitState.lastDate = currentDate;
    saveDailyLimitState();
  }
}

function saveDailyLimitState() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(dailyLimitState));
  } catch (error) {
    console.error('[谭尧限制器] 保存状态失败:', error);
  }
}

function handleAttributeChange(stat_data, attributeName, newValue, oldValue) {
  if (!isInitialized || newValue === oldValue) return;

  checkAndResetIfNewDay();

  const attrState = dailyLimitState.attributes[attributeName];
  if (!attrState) return;

  if (attrState.isLocked) {
    _.set(stat_data, '谭尧.' + attributeName, attrState.lockedValue);
    return;
  }

  attrState.changeCount++;
  if (attrState.changeCount >= CONFIG.DAILY_LIMIT) {
    attrState.isLocked = true;
    attrState.lockedValue = newValue;
    console.log('[谭尧限制器] 🔒 ' + attributeName + ' 达到每日限制，锁定在: ' + newValue);
  }
  saveDailyLimitState();
}

function setupVariableListeners() {
  eventOn(Mvu.events.SINGLE_VARIABLE_UPDATED, function (stat_data, path, old_value, new_value) {
    CONFIG.ATTRIBUTES.forEach(function (attr) {
      if (path === '谭尧.' + attr && typeof new_value === 'number' && typeof old_value === 'number') {
        handleAttributeChange(stat_data, attr, new_value, old_value);
      }
    });
  });
}

function getCurrentLimitStatus() {
  return dailyLimitState;
}
function resetAllLimits() {
  createNewDailyLimitState();
}

$(async function () {
  if (isInitialized) return;
  try {
    await waitGlobalInitialized('Mvu');
    initializeDailyLimitState();
    setupVariableListeners();
    isInitialized = true;
    window.getTanyaoLimitStatus = getCurrentLimitStatus;
    window.resetTanyaoLimits = resetAllLimits;
    console.log('[谭尧限制器] ✅ v2.0.0 初始化完成');
  } catch (error) {
    console.error('[谭尧限制器] ❌ 初始化失败:', error);
  }
});

$(window).on('beforeunload', function () {
  isInitialized = false;
  delete window.getTanyaoLimitStatus;
  delete window.resetTanyaoLimits;
});
