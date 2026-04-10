<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>聊天備份</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <!-- 每N樓備份設定 -->
      <div class="backup-row">
        <label class="backup-label">每</label>
        <input v-model.number="settings.saveInterval" type="number" min="1" max="100" class="backup-input text_pole" />
        <label class="backup-label">樓備份一次</label>
      </div>
      <p class="backup-hint">設為 1 則每次 AI 回復都備份</p>

      <!-- 立即備份 -->
      <div class="backup-btn-row">
        <button class="menu_button backup-btn" :disabled="saving" @click="saveBackup">
          {{ saving ? '⏳ 備份中…' : '💾 立即備份' }}
        </button>
      </div>

      <!-- 備份列表 -->
      <div class="backup-section">
        <div class="backup-section-title">最近備份（最多 3 份）</div>
        <div v-if="backups.length === 0" class="backup-hint">尚無備份紀錄</div>

        <div v-for="(b, i) in backups" :key="i" class="backup-item">
          <div class="backup-item-header">
            <span class="backup-slot">備份 {{ i + 1 }}</span>
            <span class="backup-time">{{ b.time }}</span>
          </div>
          <div class="backup-item-body">
            <div class="backup-meta">📁 {{ b.fileName }}</div>
            <div class="backup-meta">💾 {{ b.size }}</div>
            <div class="backup-last-msg" :title="b.lastMessage">💬 {{ b.lastMessage }}</div>
          </div>
          <div class="backup-btn-row">
            <button class="menu_button backup-btn" :disabled="restoring" @click="restoreBackup(b)">
              {{ restoring && restoringFile === b.fileName ? '⏳ 還原中…' : '↩ 還原此備份' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { klona } from 'klona';
import { onUnmounted, ref, watch } from 'vue';

// ===== 設定 =====
const Settings = z
  .object({
    saveInterval: z.number().int().min(1).default(1),
  })
  .prefault({});

const settings = ref(Settings.parse(getVariables({ type: 'script' })));
watch(settings, val => replaceVariables(klona(val), { type: 'script' }), { deep: true });

// ===== 備份紀錄 =====
type BackupRecord = {
  fileName: string; // 不含 .jsonl
  avatarUrl: string; // 角色卡 avatar，用於 API 請求
  time: string;
  size: string;
  lastMessage: string;
};

const MAX_BACKUPS = 3;
const METADATA_KEY = 'chat_backup_index';
const GLOBAL_BACKUP_KEY = 'chat_backup_records';

const backups = ref<BackupRecord[]>([]);
const restoring = ref(false);
const restoringFile = ref('');
const saving = ref(false);

/** 從 global 變量載入當前聊天的備份紀錄 */
function loadBackupRecords(): void {
  const chatId = SillyTavern.getCurrentChatId();
  if (!chatId) return;
  const all = getVariables({ type: 'global' });
  backups.value = (_.get(all, [GLOBAL_BACKUP_KEY, chatId]) ?? []) as BackupRecord[];
}

/** 將備份紀錄存入 global 變量 */
function saveBackupRecords(chatId: string, records: BackupRecord[]): void {
  updateVariablesWith(
    vars => {
      _.set(vars, [GLOBAL_BACKUP_KEY, chatId], records);
      return vars;
    },
    { type: 'global' },
  );
}

// 初始載入
loadBackupRecords();

// ===== 工具函數 =====
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function serializeChat(): string {
  const ctx = SillyTavern;
  const header = {
    user_name: ctx.name1,
    character_name: ctx.name2,
    create_date: new Date().toISOString(),
  };
  const lines = [JSON.stringify(header), ...ctx.chat.map(m => JSON.stringify(m))];
  return lines.join('\n');
}

// ===== 聊天上下文恢復 =====
/**
 * 備份操作（/api/chats/save、/api/chats/delete、/api/chats/all）可能觸發
 * SillyTavern 內部的聊天上下文切換副作用，導致角色腳本（iframe）被卸載。
 * 此函數在備份操作後檢查聊天 ID 是否改變，若改變則重新載入當前聊天以恢復腳本。
 */
async function restoreChatContextIfNeeded(expectedChatId: string): Promise<void> {
  const currentChatId = SillyTavern.getCurrentChatId();
  if (currentChatId !== expectedChatId) {
    console.warn(`[聊天備份] 聊天上下文被破壞 (${currentChatId} !== ${expectedChatId})，正在恢復…`);
    await SillyTavern.reloadCurrentChat();
    console.info('[聊天備份] 聊天上下文已恢復');
  }
}

// ===== 備份 =====
async function saveBackup(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  const ctx = SillyTavern;
  const chatId = ctx.getCurrentChatId();
  if (!chatId) {
    console.warn('[聊天備份] 無法獲取聊天 ID，跳過');
    saving.value = false;
    return;
  }

  const avatarUrl = ctx.characters[Number(ctx.characterId)]?.avatar ?? '';

  // 輪轉索引存在 global 變量
  const globalVars = getVariables({ type: 'global' });
  const currentIndex: number = (_.get(globalVars, [METADATA_KEY, chatId], 0) as number) % MAX_BACKUPS;
  const nextIndex = (currentIndex + 1) % MAX_BACKUPS;

  const charName = ctx.name2 || 'backup';
  // 用 chatId 的短 hash 區分不同聊天，避免多個聊天的備份檔名衝突
  const chatHash = chatId
    .split('')
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffff, 0)
    .toString(16)
    .padStart(4, '0');
  // 固定槽位名（不含時間戳），這是我們最終要讓磁碟上存在的檔名
  const fixedName = `${charName} - ${chatHash} back_${currentIndex}`;
  const timeLabel = new Date().toLocaleString('zh-TW', { hour12: false });
  const content = serializeChat();
  const sizeBytes = new TextEncoder().encode(content).length;

  const lastAiMsg = [...ctx.chat].reverse().find(m => !m.is_user);
  const rawText = lastAiMsg?.mes ?? '';
  const lastMsgPreview = rawText.replace(/\n/g, ' ').slice(0, 60) + (rawText.length > 60 ? '…' : '') || '（無）';

  // 記住當前聊天 ID，備份操作可能觸發 ST 內部的聊天切換副作用
  const chatIdBefore = ctx.getCurrentChatId();

  try {
    const chatArray = content.split('\n').map(line => JSON.parse(line));

    // 1. 先刪除同槽位的舊備份
    const oldRecord = backups.value.find(b => b.fileName === fixedName || b.fileName.includes(`back_${currentIndex}`));
    if (oldRecord) {
      try {
        await fetch('/api/chats/delete', {
          method: 'POST',
          headers: ctx.getRequestHeaders(),
          body: JSON.stringify({ file_name: fixedName, avatar_url: avatarUrl }),
        });
        console.info(`[聊天備份] 已刪除舊備份: ${fixedName}`);
      } catch (e) {
        console.warn('[聊天備份] 刪除舊備份失敗（忽略）:', e);
      }
    }

    // 2. 存新備份，ST 會自動在檔名前加時間戳
    const response = await fetch('/api/chats/save', {
      method: 'POST',
      headers: ctx.getRequestHeaders(),
      body: JSON.stringify({ file_name: fixedName, chat: chatArray, avatar_url: avatarUrl }),
    });

    if (!response.ok) {
      console.warn(`[聊天備份] 保存失敗: ${response.status}`);
      toastr.error(`聊天備份失敗 (${response.status})`);
      // 即使失敗也要檢查聊天上下文是否被破壞
      await restoreChatContextIfNeeded(chatIdBefore);
      return;
    }

    // 3. 列出所有聊天，找到最新的含 slotTag 的那個（就是剛存的）
    let actualFileName = fixedName;
    try {
      const allResp = await fetch('/api/chats/all', {
        method: 'POST',
        headers: ctx.getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      if (allResp.ok) {
        const allChats: Array<{ file_name: string; last_mes?: string }> = await allResp.json();
        // 找所有含 slotTag 的檔案，取最新的（last_mes 最大或排在最前面）
        const slotFiles = allChats.filter(c => c.file_name.includes(`${chatHash} back_${currentIndex}`));
        if (slotFiles.length > 0) {
          // 陣列通常按時間倒序，第一個就是最新的
          actualFileName = slotFiles[0]!.file_name.replace(/\.jsonl$/, '');
          console.info(`[聊天備份] 實際儲存檔名: ${actualFileName}`);
        }
      }
    } catch (e) {
      console.warn('[聊天備份] 查詢實際檔名失敗（使用預設名）:', e);
    }

    // 3.5. 恢復聊天上下文（如果被備份操作破壞）
    await restoreChatContextIfNeeded(chatIdBefore);

    // 4. 更新輪轉索引
    updateVariablesWith(
      vars => {
        _.set(vars, [METADATA_KEY, chatId], nextIndex);
        return vars;
      },
      { type: 'global' },
    );

    const record: BackupRecord = {
      fileName: actualFileName,
      avatarUrl,
      time: timeLabel,
      size: formatBytes(sizeBytes),
      lastMessage: lastMsgPreview,
    };
    // 替換同槽位的舊紀錄
    const filtered = backups.value.filter(b => b.fileName !== fixedName);
    backups.value = [record, ...filtered].slice(0, MAX_BACKUPS);
    saveBackupRecords(chatId, backups.value);

    toastr.success(`已備份至 ${actualFileName}`);
    console.info(`[聊天備份] 備份完成: ${actualFileName} (${formatBytes(sizeBytes)})`);
  } catch (err) {
    console.error('[聊天備份] 錯誤:', err);
    toastr.error('聊天備份發生錯誤，請查看控制台');
    // 錯誤時也嘗試恢復聊天上下文
    await restoreChatContextIfNeeded(chatIdBefore);
  } finally {
    saving.value = false;
  }
}

// ===== 還原 =====
async function restoreBackup(b: BackupRecord): Promise<void> {
  if (restoring.value) return;

  const ctx = SillyTavern;

  // 確認對話框
  const confirmed = await ctx.callGenericPopup(
    `確定要還原備份「${b.fileName}」嗎？<br><small>這將會導入備份並切換到該聊天紀錄。</small>`,
    ctx.POPUP_TYPE.CONFIRM,
  );
  if (!confirmed) return;

  restoring.value = true;
  restoringFile.value = b.fileName;

  try {
    // 1. 從後端讀取備份內容
    const getResp = await fetch('/api/chats/get', {
      method: 'POST',
      headers: ctx.getRequestHeaders(),
      body: JSON.stringify({
        file_name: b.fileName,
        avatar_url: b.avatarUrl,
      }),
    });

    if (!getResp.ok) {
      toastr.error(`無法讀取備份 (${getResp.status})`);
      return;
    }

    const chatArray: SillyTavern.ChatMessage[] = await getResp.json();
    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      toastr.error('備份內容為空或格式錯誤');
      return;
    }

    // 2. 將備份內容序列化為 jsonl 字串，用 importRawChat 導入
    const jsonlContent = chatArray.map(m => JSON.stringify(m)).join('\n');
    await importRawChat(`${b.fileName}.jsonl`, jsonlContent);

    // 3. importRawChat 會產生一個新的聊天文件（名稱由酒館決定），
    //    用 openCharacterChat 切換到最新的聊天（即剛導入的那個）
    //    酒館導入後會自動切換，但保險起見重新載入
    await ctx.reloadCurrentChat();

    toastr.success(`已還原備份：${b.fileName}`);
    console.info(`[聊天備份] 還原完成: ${b.fileName}`);
  } catch (err) {
    console.error('[聊天備份] 還原錯誤:', err);
    toastr.error('還原時發生錯誤，請查看控制台');
  } finally {
    restoring.value = false;
    restoringFile.value = '';
  }
}

// ===== 事件監聽 =====
let messageCount = 0;

const listener = eventOn(
  tavern_events.GENERATION_ENDED,
  errorCatched(async () => {
    messageCount++;
    if (messageCount % settings.value.saveInterval === 0) {
      await saveBackup();
    }
  }),
);

const chatChangeListener = eventOn(tavern_events.CHAT_CHANGED, () => {
  messageCount = 0;
  loadBackupRecords();
});

onUnmounted(() => {
  listener.stop();
  chatChangeListener.stop();
});
</script>

<style scoped>
.backup-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.backup-label {
  white-space: nowrap;
  font-size: 14px;
}

.backup-input {
  width: 60px;
  text-align: center;
  padding: 2px 6px;
}

.backup-hint {
  font-size: 12px;
  color: var(--SmartThemeEmColor);
  font-style: italic;
  margin: 0 0 10px 0;
}

.backup-section {
  margin-top: 12px;
  border-top: 1px solid var(--SmartThemeBorderColor);
  padding-top: 10px;
}

.backup-section-title {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--SmartThemeBodyColor);
}

.backup-item {
  background: var(--SmartThemeBlurTintColor);
  border: 1px solid var(--SmartThemeBorderColor);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.backup-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.backup-slot {
  font-size: 13px;
  font-weight: bold;
  color: var(--SmartThemeBodyColor);
}

.backup-time {
  font-size: 11px;
  color: var(--SmartThemeEmColor);
}

.backup-item-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.backup-meta {
  font-size: 12px;
  color: var(--SmartThemeEmColor);
  word-break: break-all;
}

.backup-last-msg {
  font-size: 12px;
  color: var(--SmartThemeBodyColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.backup-btn-row {
  display: flex;
}

.backup-btn {
  width: 100%;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}
</style>
