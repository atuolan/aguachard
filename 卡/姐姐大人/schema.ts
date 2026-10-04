// 姊姊大人 MVU 變量結構
//
//   世界 / user / 黎靖青/穷云海 / 黎靖青 / 关系 / 场景 — 模型可寫
//   _状态 — 狀態腳本獨占；`_` 開頭的路徑模型寫不進去（mvu_zod 直接丟棄）
//
// 數值不進上下文：變量列表只給模型看文字欄位，冷淡值、亲密值、兴奋值由狀態腳本轉成心態描述再注入。
// 牽涉多個欄位的規則（身分與場合的搭配、關係一次一段、鎖定與上限）都在 脚本/状态 的結算裡，
// 這裡只放單一欄位的範圍與預設值——schema 每條指令都會跑一次，跨欄位規則寫在這裡會受指令順序影響。

export const 身份列表 = ['黎靖青', '穷云海'] as const;
// 黎靖青：职场／私下（男裝在家）；穷云海：营业（女僕咖啡廳）／私下（女裝但不營業）
export const 场合列表 = ['职场', '私下', '营业'] as const;
export const 现实阶段 = ['陌生', '同事', '朋友', '暧昧', '恋人', '伴侣'] as const;
export const 线上阶段 = ['无', '网友', '熟网友', '暧昧', '网恋'] as const;
export const 表态列表 = ['', '接受', '抗拒', '回避'] as const;
// 每天的小事：平日三選一、週末二選一；空字串＝還沒擲（開場那天不擲）
export const 小事列表 = ['', '准时下班', '早下班', '加班', '有排班', '没排班'] as const;

const 数值 = (init: number) =>
  z.coerce
    .number()
    .transform(v => _.clamp(Number.isFinite(v) ? v : init, 0, 100))
    .prefault(init);

const 额度 = z
  .object({ 累计: z.coerce.number().prefault(0), 锁定: z.boolean().prefault(false) })
  .prefault({});

// 舊存檔：目前模式 拆成 场合 與 关系；event_data.身份试探、_每日变动 搬進 _状态。
// 只在新欄位還不存在時搬，搬過一次之後舊欄位就被 schema 丟掉，不會重複套用
const 旧模式到场合: Record<string, string> = { 上司: '职场', 伪娘: '营业', 私下状态: '私下', 恋人: '私下' };

function 迁移(raw: unknown): unknown {
  if (!_.isPlainObject(raw)) return raw;
  const data = _.cloneDeep(raw) as Record<string, any>;
  const 人 = data.黎靖青;
  if (_.isPlainObject(人) && 人.场合 === undefined && typeof 人.目前模式 === 'string') {
    人.场合 = 旧模式到场合[人.目前模式] ?? (人.目前身份 === '穷云海' ? '营业' : '职场');
    if (人.目前模式 === '恋人' && data.关系 === undefined) data.关系 = { 现实: '恋人' };
  }
  const 旧事件 = data.event_data?.身份试探;
  if (_.isPlainObject(旧事件) && data._状态?.身分试探 === undefined) {
    const 进度 = Number(String(旧事件.消息进度 ?? '').match(/^(\d+)\/20$/)?.[1] ?? 0);
    _.set(data, '_状态.身分试探', {
      进行中: 旧事件.进行中 === true,
      已完成: 旧事件.已完成 === true,
      进度: 旧事件.已完成 === true ? 20 : 进度,
      // 舊版完成後一律寫「他已經得到想要的答案」，照接受處理
      结果: 旧事件.已完成 === true ? '接受' : '',
    });
  }
  if (_.isPlainObject(data._每日变动) && data._状态?.每日 === undefined) {
    const 旧 = data._每日变动;
    _.set(data, '_状态.每日', { 日期: 旧.日期 ?? '', 冷淡值: 旧.冷淡值 ?? {}, 亲密值: 旧.亲密值 ?? {} });
  }
  return data;
}

export const Schema = z.preprocess(
  迁移,
  z.object({
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
        目前身份: z.enum(身份列表).prefault('黎靖青'),
        场合: z.enum(场合列表).prefault('职场'),
        心情: z.string().prefault('冷静'),
        冷淡值: 数值(100),
        亲密值: 数值(0),
        兴奋值: 数值(0),
        性爱场景中: z.boolean().prefault(false),
        内心想法: z.string().prefault(''),
        待办事项: z.string().prefault('无'),
      })
      .prefault({}),

    关系: z
      .object({
        现实: z.enum(现实阶段).prefault('同事'),
        线上: z.enum(线上阶段).prefault('无'),
      })
      .prefault({}),

    // 一次性訊號：身分試探收尾時模型寫一次，狀態腳本讀完就清空
    场景: z
      .object({
        事件完成: z.string().prefault(''),
        // 模型可能寫成「接受了」「有点抗拒」：認得出關鍵字就收，認不出當作沒寫
        表态: z
          .string()
          .transform(v => 表态列表.find(t => t && v.includes(t)) ?? '')
          .prefault(''),
      })
      .prefault({}),

    _状态: z
      .object({
        每日: z
          .object({
            日期: z.string().prefault(''),
            冷淡值: 额度,
            亲密值: 额度,
          })
          .prefault({}),
        身分试探: z
          .object({
            进行中: z.boolean().prefault(false),
            已完成: z.boolean().prefault(false),
            // 事件開始後經過的 AI 回覆數；滿 20 進入攤牌／直接詢問
            进度: z.coerce.number().prefault(0),
            结果: z.enum(表态列表).prefault(''),
            // 抗拒或迴避之後，還要經過幾則 AI 回覆才可以再觸發
            冷却: z.coerce.number().prefault(0),
          })
          .prefault({}),
        // 日常：換日時擲一次小事，偶爾再抽一件大事；袋子是洗牌抽法，同一池抽完一輪才重洗
        日常: z
          .object({
            日期: z.string().prefault(''),
            小事: z.enum(小事列表).prefault(''),
            大事: z.string().prefault(''),
            距上次大事: z.coerce.number().prefault(99),
            袋: z.record(z.string(), z.array(z.string())).prefault({}),
            // 今天誰要主動發一則小紅書；模型發出來（正文裡出現他的 <rednote> 帖子）就記 已发，不再提醒
            发文: z.enum(['', '穷云海', '黎靖青']).prefault(''),
            已发: z.boolean().prefault(false),
            距上次发文: z.coerce.number().prefault(99),
          })
          .prefault({}),
      })
      .prefault({}),
  }),
);

export type StatData = z.output<typeof Schema>;
