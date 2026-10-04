import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.preprocess(
  // 兼容旧版变量，新版数据原样通过：
  //   第一版把小雅事件的 6 个字段放在 谭尧 底下；第二版的 _小雅事件 只是一个字符串（未触发／进行中／已结束）
  input => {
    if (!_.isPlainObject(input)) return input;
    let 输出 = input;
    const 旧字段 = ['小雅嫉妒事件已触发', '小雅嫉妒事件结束', '小雅危险等级', '当前威胁', '事件触发时亲密度', '事件结束时亲密度'];
    if (_.isPlainObject(输出.谭尧) && 旧字段.some(字段 => 字段 in 输出.谭尧)) {
      const 为真 = value => value === true || value === 'true';
      const { 小雅嫉妒事件已触发: 已触发, 小雅嫉妒事件结束: 已结束 } = 输出.谭尧;
      const 旧状态 = 为真(已结束) ? '已结束' : 为真(已触发) ? '进行中' : undefined;
      // 新旧并存时，新写入的值优先，旧数据只补缺
      输出 = { ...输出, 谭尧: _.omit(输出.谭尧, 旧字段), _小雅事件: 输出._小雅事件 ?? 旧状态 };
    }
    if (typeof 输出._小雅事件 === 'string') {
      // 旧版进行中的事件从第一步重新走；已结束的不补结局
      const 换算 = { 进行中: { 阶段: '门口的人' }, 已结束: { 阶段: '已了结' } };
      输出 = { ...输出, _小雅事件: 换算[输出._小雅事件] };
    }
    return _.omitBy(输出, _.isUndefined);
  },
  z.object({
    谭尧: z
      .object({
        好感度: z.coerce
          .number()
          .prefault(0)
          .transform(v => _.clamp(v, 0, 100)),
        恶感度: z.coerce
          .number()
          .prefault(60)
          .transform(v => _.clamp(v, 0, 100)),
        警惕值: z.coerce
          .number()
          .prefault(100)
          .transform(v => _.clamp(v, 0, 100)),
        亲密度: z.coerce
          .number()
          .prefault(0)
          .transform(v => _.clamp(v, 0, 100)),
        时间: z.string().prefault('4/22 - 周三 - 上午 - 10:22 - 阴雨'),
        心情: z.string().prefault('烦躁、漠然'),
        想法: z.string().prefault('暂无'),
        约定与代办事项: z.string().prefault('暂无'),
      })
      .prefault({})
      .transform(data => {
        const $亲密度已解锁 = data.好感度 >= 30 && data.恶感度 < 50;
        return { ...data, $亲密度已解锁 };
      }),
    // AI 在事情告一段落那一回合回报：事件名与{{user}}的态度。文件末尾的规则读完就清空
    事件完成: z.string().prefault(''),
    表态: z.string().prefault(''),
    // 只读：四项数值当天各变动了几次，日期取自 谭尧.时间，由文件末尾的数值规则维护
    _每日变动: z
      .object({
        日期: z.string().prefault(''),
        好感度: z.coerce.number().prefault(0),
        恶感度: z.coerce.number().prefault(0),
        警惕值: z.coerce.number().prefault(0),
        亲密度: z.coerce.number().prefault(0),
      })
      .prefault({}),
    // 只读：小雅事件的进度，由文件末尾的数值规则维护；世界书「小雅事件」照它决定注入什么
    _小雅事件: z
      .object({
        阶段: z.enum(['未触发', '门口的人', '示好与示威', '骚扰期', '越界', '收场', '已了结']).prefault('未触发'),
        // 触发后累计过了几个游戏日
        天数: z.coerce.number().prefault(0),
        // 这一阶段开门（开始注入）的那天；还没开门时是预定开门的那天
        开门天: z.coerce.number().prefault(0),
        已开门: z.boolean().prefault(false),
        // 开门时就掷定的走向
        骰果: z.string().prefault(''),
        骰点: z.coerce.number().prefault(0),
        // 骚扰期：下一则短信在哪天、今天是不是短信日
        下则短信天: z.coerce.number().prefault(0),
        短信日: z.coerce.number().prefault(-1),
        // 每一步收尾时记下的骰果与{{user}}的态度，结局与后面的加成都看它
        骰果记录: z.record(z.string(), z.string()).prefault({}),
        表态记录: z.record(z.string(), z.string()).prefault({}),
      })
      .prefault({}),
  }),
);

// 下面的规则要对比本轮更新前的数值，但 registerMvuSchema 每执行一条更新指令就跑一次 schema，也拿不到上一楼的数值，
// 因此改在整轮指令全部执行完后统一处理。状态都存在楼层变量里，重 roll、删楼、切换聊天都会跟着回到对应楼层的状态。
const 每日变动上限 = 7;
const 限次数值 = ['好感度', '恶感度', '警惕值', '亲密度'];

/** 从 '4/22 - 周三 - …' 取出 '4/22'；AI 写成 '2026/4/22'、'4月22日' 或把日期挪到中间也认，取不到时返回 undefined */
function 取日期(时间) {
  const 匹配 = 时间.match(/(?<!\d)(\d{1,2})\s*[/月]\s*(\d{1,2})(?!\d)/);
  if (!匹配) return undefined;
  const [月, 日] = [Number(匹配[1]), Number(匹配[2])];
  return 月 >= 1 && 月 <= 12 && 日 >= 1 && 日 <= 31 ? `${月}/${日}` : undefined;
}

/** 两个 'M/D' 之间过了几天；跨年照算，日期往回写（多半是笔误）当作没过 */
function 日差(旧日期, 新日期) {
  const 解析 = 日期 => {
    const [月, 日] = 日期.split('/').map(Number);
    return Date.UTC(2001, 月 - 1, 日);
  };
  let 差 = Math.round((解析(新日期) - 解析(旧日期)) / 86400000);
  if (差 < 0) 差 += 365;
  return 差 > 180 ? 0 : 差;
}

// ===== 小雅事件 =====
// 亲密度进入 50~55 时触发，之后与亲密度无关：
//   门口的人 → 示好与示威 → 骚扰期（30 天，每 2~4 天一则短信） → 越界 → 收场 → 已了结
// 每一步开门时掷 d20 定走向，AI 照走向演、事情告一段落时回报 事件完成；步与步之间隔 2 天。
// 文字都在世界书「小雅事件」里，这里只管进度。
const 小雅步骤 = ['门口的人', '示好与示威', '骚扰期', '越界', '收场'];
const 步间隔天数 = 2;
// 拖满 4 天世界书会催收尾，满 6 天自动收尾、进下一步
const 自动收尾天数 = 6;
const 骚扰天数 = 30;
const 短信间隔 = [2, 4];
const 告诉他加成步骤 = ['越界', '收场'];

/** 与庾安荷同一张六档表：1 灾难、2~5 失败、6~10 部分成功、11~15 成功、16~19 良好、20 极佳 */
function 掷骰(加成, rng) {
  const 底 = Math.floor(rng() * 20) + 1;
  const 点数 = _.clamp(底 + 加成, 1, 20);
  const 骰果 =
    点数 === 1 ? '灾难' : 点数 <= 5 ? '失败' : 点数 <= 10 ? '部分成功' : 点数 <= 15 ? '成功' : 点数 <= 19 ? '良好' : '极佳';
  return { 点数, 骰果 };
}

// AI 可能写繁体或加引号；比对前统一成简体、去掉引号空白，互相包含就算
const 繁简 = { 門: '门', 與: '与', 場: '场', 騷: '骚', 擾: '扰', 結: '结', 過: '过', 訴: '诉' };
const 正规化 = 文字 =>
  String(文字 ?? '')
    .replace(/[「」『』"'“”‘’\s]/g, '')
    .replace(/[門與場騷擾結過訴]/g, 字 => 繁简[字]);

function 名称相符(回报, 阶段) {
  const a = 正规化(回报);
  const b = 正规化(阶段);
  return a !== '' && (a.includes(b) || b.includes(a));
}

// AI 照规则只该写那几个词；万一写成句子，先认否定（「不追究」「没告诉他」），再认肯定
function 正规表态(阶段, 表态) {
  const 值 = 正规化(表态);
  if (阶段 === '收场') return /不追究|放/.test(值) ? '放过' : /追/.test(值) ? '追究' : '看不出';
  if (/[不没沒]告|瞒|瞞|扛|自己|报警|報警/.test(值)) return '自己扛';
  return /告/.test(值) ? '告诉他' : '看不出';
}

function 收尾(事件, 表态) {
  事件.骰果记录 = { ...事件.骰果记录, [事件.阶段]: 事件.骰果 };
  事件.表态记录 = { ...事件.表态记录, [事件.阶段]: 表态 };
  事件.阶段 = 小雅步骤[小雅步骤.indexOf(事件.阶段) + 1] ?? '已了结';
  事件.开门天 = 事件.天数 + 步间隔天数;
  事件.已开门 = false;
  事件.骰果 = '';
  事件.骰点 = 0;
}

function 推进小雅事件(事件, 谭尧, 过去天数, 回报, 表态, rng = Math.random) {
  if (事件.阶段 === '已了结') return;
  if (事件.阶段 === '未触发') {
    if (谭尧.亲密度 < 50 || 谭尧.亲密度 > 55) return;
    Object.assign(事件, { 阶段: '门口的人', 天数: 0, 开门天: 0, 已开门: false });
  } else {
    事件.天数 += 过去天数;
  }

  // 收尾：先于开门处理，所以本楼才开门的事不会在本楼被收尾（AI 写这一楼时还没看到它）
  if (事件.已开门 && 事件.阶段 !== '骚扰期') {
    if (名称相符(回报, 事件.阶段)) 收尾(事件, 正规表态(事件.阶段, 表态));
    else if (事件.天数 - 事件.开门天 >= 自动收尾天数) 收尾(事件, '看不出');
  }
  if (事件.阶段 === '骚扰期' && 事件.已开门 && 事件.天数 - 事件.开门天 >= 骚扰天数) {
    // 骚扰满一个月，紧接着越界，不再隔天
    Object.assign(事件, { 阶段: '越界', 开门天: 事件.天数, 已开门: false, 短信日: -1 });
  }

  // 开门：到了预定的那天才开；骚扰期不掷骰，改排第一则短信
  if (!事件.已开门 && 事件.阶段 !== '已了结' && 事件.天数 >= 事件.开门天) {
    事件.已开门 = true;
    事件.开门天 = 事件.天数;
    if (事件.阶段 === '骚扰期') {
      事件.下则短信天 = 事件.天数;
    } else {
      // 曹咸够信任{{user}}，{{user}}一有异状他更容易察觉；前面让他知道过，越界与收场再加一层
      let 加成 = 谭尧.警惕值 <= 40 ? 2 : 0;
      if (告诉他加成步骤.includes(事件.阶段) && Object.values(事件.表态记录).includes('告诉他')) 加成 += 2;
      const { 点数, 骰果 } = 掷骰(加成, rng);
      事件.骰点 = 点数;
      事件.骰果 = 骰果;
    }
  }

  if (事件.阶段 === '骚扰期' && 事件.已开门 && 事件.天数 >= 事件.下则短信天) {
    事件.短信日 = 事件.天数;
    事件.下则短信天 = 事件.天数 + 短信间隔[0] + Math.floor(rng() * (短信间隔[1] - 短信间隔[0] + 1));
  }
}

function 应用数值规则(stat_data, 旧stat_data) {
  if (!_.has(旧stat_data, '谭尧')) return;
  const 新 = Schema.safeParse(stat_data);
  const 旧 = Schema.safeParse(旧stat_data);
  if (!新.success || !旧.success) return;
  const { 谭尧, _每日变动: 记录 } = 新.data;
  const 旧谭尧 = 旧.data.谭尧;

  // 亲密度锁定：本轮更新前尚未解锁（即 AI 写这条回复时看到的状态），亲密度就不得变动
  if (!旧谭尧.$亲密度已解锁) 谭尧.亲密度 = 旧谭尧.亲密度;

  // 每日变动上限：换日就重新计数；每项数值每天最多变动 7 次（每楼算一次），之后的变动会被还原
  // 认不出日期时没法换日，若照样限次，计数永远不归零、四项数值会一直锁死，所以这一楼不限
  const 今天 = 取日期(谭尧.时间);
  const 过去天数 = 今天 && 记录.日期 ? 日差(记录.日期, 今天) : 0;
  if (今天 && 今天 !== 记录.日期) {
    记录.日期 = 今天;
    限次数值.forEach(数值 => (记录[数值] = 0));
  }
  限次数值.forEach(数值 => {
    if (!今天) return;
    if (谭尧[数值] === 旧谭尧[数值]) return;
    if (记录[数值] >= 每日变动上限) 谭尧[数值] = 旧谭尧[数值];
    else 记录[数值] += 1;
  });

  推进小雅事件(新.data._小雅事件, 谭尧, 过去天数, 新.data.事件完成, 新.data.表态);
  // 回报只在写下的那一楼有效
  新.data.事件完成 = '';
  新.data.表态 = '';

  // 再跑一次 schema，让 $亲密度已解锁 按还原后的数值重新计算
  Object.assign(stat_data, Schema.parse(新.data));
}

$(async () => {
  registerMvuSchema(Schema);
  await waitGlobalInitialized('Mvu');
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) =>
    应用数值规则(variables.stat_data, variables_before_update.stat_data),
  );
});
