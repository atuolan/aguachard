// 姊姊大人・设定
//
// 一個「设定」按鈕：網名、音樂、輸入助手放在同一個視窗。
//
// 網名是玩家設定，不是劇情狀態，存在聊天變量 user网名（不放 MVU：MVU 變量會被模型改寫）。
// 讀它的地方：〈用戶身分與穿著〉的 {{getvar::user网名}}、狀態腳本注入的「網友『○○』」。
// 按發送時如果還沒設定，就先暫停這次發送，跳出輸入框；設定好才繼續送出。
// 做法：GENERATION_AFTER_COMMANDS 在使用者訊息送出之前發出，而且酒館會等每個監聽器跑完，
// 所以在這裡等彈窗關閉，就等於把發送停在原地。這支腳本要排在狀態腳本前面，注入才拿得到新網名。
//
// 音樂、輸入助手直接開關角色卡上的正則與腳本，狀態就存在角色卡裡，不另外記。
// 音樂＝〈音樂播放器〉正則（舊版卡是 曲目1～8，一併認）。關掉時 [曲目N] 由一直開著的〈設定入口〉換成小齒輪，
// 播放器和小齒輪點下去都會發 姊姊大人:打开设定 事件，打開同一個設定視窗。

const KEY = 'user网名';
const 曲目正则 = /^(音樂播放器|曲目\d+)$/;
const 输入助手 = '輸入助手';

// 舊開場白的 `@user网名=xxx@` 沒改過時，存進來的是 xxx
const 未设定 = (name: string) => !name || name === 'xxx';

function 读网名(): string {
  return String(_.get(getVariables({ type: 'chat' }), KEY) ?? '').trim();
}

function 存网名(name: string): void {
  insertOrAssignVariables({ [KEY]: name }, { type: 'chat' });
}

// 型別定義沒列出 result／value／inputResults，但酒館的 Popup.complete() 會在呼叫 onClosing 之前設好
type 弹窗 = { result?: number; value?: unknown; inputResults?: Map<string, string | boolean> };

// 發送前的必填彈窗：沒填就關不掉（包括按 Esc）
async function 要求网名(): Promise<void> {
  const result = await SillyTavern.callGenericPopup(
    '开始之前，请先设定你的网名——穷云海在网上认识的那个你。<br>之后可以随时用「设定」按钮修改。',
    SillyTavern.POPUP_TYPE.INPUT,
    '',
    {
      okButton: '确定',
      cancelButton: false,
      onClosing: async popup => {
        const p = popup as 弹窗;
        return p.result === SillyTavern.POPUP_RESULT.AFFIRMATIVE && String(p.value ?? '').trim() !== '';
      },
    },
  );
  if (typeof result !== 'string' || !result.trim()) return;
  存网名(result.trim());
  toastr.success(`网名已设定为「${result.trim()}」`);
}

function 找脚本(trees: ScriptTree[], name: string): Script | null {
  for (const t of trees) {
    if (t.type === 'script' && t.name === name) return t;
    if (t.type === 'folder') {
      const found = 找脚本(t.scripts, name);
      if (found) return found;
    }
  }
  return null;
}

function 音乐开着(): boolean {
  return getTavernRegexes({ type: 'character', name: 'current' }).some(r => 曲目正则.test(r.script_name) && r.enabled);
}

function 输入助手开着(): boolean | null {
  const s = 找脚本(getScriptTrees({ type: 'character' }), 输入助手);
  return s ? s.enabled : null;
}

async function 打开设定(): Promise<void> {
  const 现在网名 = 读网名();
  const 音乐 = 音乐开着();
  const 助手 = 输入助手开着();
  let 勾选: Map<string, string | boolean> | undefined;

  const result = await SillyTavern.callGenericPopup(
    '<h3>设定</h3>网名（穷云海在网上认识的那个你）',
    SillyTavern.POPUP_TYPE.INPUT,
    未设定(现在网名) ? '' : 现在网名,
    {
      okButton: '保存',
      cancelButton: '取消',
      customInputs: [
        { id: 'jj_music', label: '播放音乐', type: 'checkbox', defaultState: 音乐 },
        ...(助手 === null ? [] : [{ id: 'jj_input_helper', label: '输入助手', type: 'checkbox', defaultState: 助手 }]),
      ],
      onClosing: async popup => {
        勾选 = (popup as 弹窗).inputResults;
        return true;
      },
    },
  );
  if (typeof result !== 'string') return; // 取消

  const 变更: string[] = [];
  const 新网名 = result.trim();
  if (新网名 && 新网名 !== 现在网名) {
    存网名(新网名);
    变更.push(`网名「${新网名}」`);
  }

  const 要音乐 = Boolean(勾选?.get('jj_music'));
  const 要助手 = 助手 === null ? null : Boolean(勾选?.get('jj_input_helper'));

  if (要助手 !== null && 要助手 !== 助手) {
    updateScriptTreesWith(trees => {
      const s = 找脚本(trees, 输入助手);
      if (s) s.enabled = 要助手;
      return trees;
    }, { type: 'character' });
    变更.push(`输入助手${要助手 ? '开启' : '关闭'}`);
  }

  // 改正則會重新載入整個聊天，放最後做
  if (要音乐 !== 音乐) {
    变更.push(`音乐${要音乐 ? '开启' : '关闭'}`);
    toastr.success(`已保存：${变更.join('、')}`);
    await updateTavernRegexesWith(
      regexes => {
        for (const r of regexes) if (曲目正则.test(r.script_name)) r.enabled = 要音乐;
        return regexes;
      },
      { type: 'character', name: 'current' },
    );
    return;
  }

  if (变更.length) toastr.success(`已保存：${变更.join('、')}`);
}

$(() => {
  // 只攔一般的發送：重新生成、swipe、繼續、靜默生成都不問
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, async (type, _option, dry_run) => {
    if (dry_run || (type !== 'normal' && type !== undefined)) return;
    if (!未设定(读网名())) return;
    await 要求网名();
  });

  eventOn(getButtonEvent('设定'), () => {
    打开设定();
  });
  // 開場白播放器上的齒輪
  eventOn('姊姊大人:打开设定', () => {
    打开设定();
  });
});
