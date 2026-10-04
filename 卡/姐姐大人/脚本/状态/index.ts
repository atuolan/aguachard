// 姊姊大人・狀態腳本
//
// 取代舊的 每日变动、身份试探、性爱场景锁定 三支腳本，以及〈推進〉〈身分試探〉〈做爱时〉〈狀態欄嗷〉四個 EJS 條目。
//   1. VARIABLE_UPDATE_ENDED     — 結算：上限、鎖定、不可逆、關係一次一段、身分試探事件、換日擲日常；狀態寫回 stat_data._状态
//   2. GENERATION_AFTER_COMMANDS — 每次生成前，用最新樓層的變量組出心態描述與眼下事件，注入一次
//
// 規則本體在同資料夾 rules.ts，這裡只做搬運。
import { Schema } from '../../schema';
import { 底色文, 眼下文, 结算, type Stat } from './rules';

const LOG = '[姊姊大人状态]';
const 底色ID = '姊姊大人:当前状态';
const 眼下ID = '姊姊大人:眼下';

// 舊存檔在模型沒有寫任何指令的那一樓，stat_data 還沒經過 schema（目前模式 還沒拆成 场合／关系），
// 先自己跑一次，結算與注入看到的永遠是遷移過、補齊預設值的資料
function 规范(stat: unknown): Stat | null {
  if (!_.isPlainObject(stat)) return null;
  const parsed = Schema.safeParse(stat);
  if (parsed.success) return parsed.data as Stat;
  console.warn(LOG, '变量不符合结构，照原样使用', parsed.error);
  return stat as Stat;
}

function 最新变量(): Stat | null {
  for (let i = getLastMessageId(); i >= 0; i -= 1) {
    const stat = _.get(getVariables({ type: 'message', message_id: i }), 'stat_data');
    if (stat?.黎靖青) return 规范(stat);
  }
  return null;
}

// 網名存在聊天變量 user网名，由「设定网名」腳本在第一次發送前問玩家；舊聊天由開場白的 `@user网名=xxx@` 正則設定，沒改過就是 xxx
function 网名(): string {
  const name = String(_.get(getVariables({ type: 'chat' }), 'user网名') ?? '').trim();
  return name && name !== 'xxx' ? name : '（未设定网名）';
}

function settle(variables: Mvu.MvuData, before: Mvu.MvuData): void {
  const stat = 规范(_.get(variables, 'stat_data'));
  if (!stat?.黎靖青) return;
  const 楼 = getLastMessageId();
  // 第 0 樓是開場白在設定起點：沒有「更新前」可比
  const prev = 楼 <= 0 ? null : 规范(_.get(before, 'stat_data'));
  // 舊存檔第一次更新：更新前還沒有 关系，那是補上的預設值，不是真的關係；這一次讓模型直接寫到位
  if (prev && _.get(before, 'stat_data.关系') === undefined) prev.关系 = _.cloneDeep(stat.关系);
  const AI楼 = getChatMessages(楼)[0]?.role === 'assistant';
  const log = 结算(stat, prev?.黎靖青 ? prev : null, AI楼);
  _.set(variables, 'stat_data', stat);
  if (log.length) console.info(LOG, `第 ${楼} 楼：${log.join('；')}`);
}

$(async () => {
  await waitGlobalInitialized('Mvu');

  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, errorCatched(settle));

  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (_type, _option, dry_run) => {
    if (dry_run) return;
    const stat = 最新变量();
    if (!stat) return;
    const name = 网名();
    const 眼下 = 眼下文(stat);
    injectPrompts(
      [
        {
          id: 底色ID,
          position: 'in_chat',
          depth: 1,
          role: 'system',
          content: substitudeMacros(底色文(stat, name)),
          should_scan: false,
        },
        ...(眼下
          ? [
              {
                id: 眼下ID,
                position: 'in_chat' as const,
                depth: 0,
                role: 'system' as const,
                content: substitudeMacros(眼下),
                should_scan: false,
              },
            ]
          : []),
      ],
      { once: true },
    );
  });

  console.info(LOG, '已载入');
});
