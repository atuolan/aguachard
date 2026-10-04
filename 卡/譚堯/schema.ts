export const Schema = z.preprocess(
  // 兼容旧版变量，新版数据原样通过：
  //   第一版把小雅事件的 6 个字段放在 谭尧 底下；第二版的 _小雅事件 只是一个字符串（未触发／进行中／已结束）
  (input: any) => {
    if (!_.isPlainObject(input)) return input;
    let 输出 = input;
    const 旧字段 = ['小雅嫉妒事件已触发', '小雅嫉妒事件结束', '小雅危险等级', '当前威胁', '事件触发时亲密度', '事件结束时亲密度'];
    if (_.isPlainObject(输出.谭尧) && 旧字段.some(字段 => 字段 in 输出.谭尧)) {
      const 为真 = (value: unknown) => value === true || value === 'true';
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
export type Schema = z.output<typeof Schema>;
