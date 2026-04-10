<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>雲端同步</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="cloudsync-status-row">
        <span class="cloudsync-dot" :class="{ active: isRunning }"></span>
        <span>{{ isRunning ? '同步監聽中' : '未啟動' }}</span>
      </div>
      <p class="cloudsync-hint">偵測到其他設備的變更時，自動重新載入聊天或刷新頁面</p>
      <div class="cloudsync-btn-row">
        <button class="menu_button cloudsync-btn" @click="toggle">{{ isRunning ? '⏹ 停止同步' : '▶ 啟動同步' }}</button>
      </div>
      <div class="cloudsync-section">
        <p class="cloudsync-hint">📱 本機：{{ localDeviceName }}（{{ localDeviceId }}）</p>
        <label class="cloudsync-checkbox-label">
          <input v-model="settings.syncEnabled" type="checkbox" />
          本機接收同步
        </label>
        <p class="cloudsync-hint">
          關閉後，本機即使啟動同步也不會觸發重新載入，適合只想在這台設備上編輯而不被其他設備干擾的情況
        </p>
      </div>
      <div class="cloudsync-section">
        <label class="cloudsync-label"
          >輪詢間隔（秒）：<input
            v-model.number="settings.intervalSec"
            type="number"
            min="10"
            max="600"
            step="10"
            class="text_pole cloudsync-input"
        /></label>
        <p class="cloudsync-hint">預設 300 秒（5 分鐘），可自行調整</p>
      </div>
      <div class="cloudsync-section">
        <label class="cloudsync-label"
          >本機操作冷卻（秒）：<input
            v-model.number="settings.localCooldownSec"
            type="number"
            min="1"
            max="30"
            step="1"
            class="text_pole cloudsync-input"
        /></label>
        <p class="cloudsync-hint">本機操作後的冷卻時間內不會觸發同步，避免誤判</p>
      </div>
      <div class="cloudsync-section">
        <label class="cloudsync-label"
          >閒置判定（分鐘）：<input
            v-model.number="settings.idleMinutes"
            type="number"
            min="1"
            max="30"
            step="1"
            class="text_pole cloudsync-input"
        /></label>
        <p class="cloudsync-hint">頁面切到後台、或超過此時間沒有操作，才會觸發同步</p>
      </div>
      <div class="cloudsync-section">
        <p class="cloudsync-hint">聊天變更 → 重新載入聊天；角色卡/世界書變更 → 整頁刷新</p>
      </div>
      <div v-if="lastSyncInfo" class="cloudsync-section">
        <p class="cloudsync-hint">上次偵測：{{ lastSyncInfo }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { klona } from 'klona';
import { onUnmounted, ref, watch } from 'vue';

function stableDeviceId(): string {
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) {
    const m = ua.match(/Android[^;]*;\s*([^)]+)\)/);
    if (m) {
      const model = m[1].trim().split(' Build')[0];
      if (model && model.length < 30) return model;
    }
    return 'Android';
  }
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

const Settings = z
  .object({
    intervalSec: z.number().min(10).max(600).default(300),
    localCooldownSec: z.number().min(1).max(30).default(10),
    idleMinutes: z.number().min(1).max(30).default(5),
    syncMode: z.enum(['chat', 'full']).default('chat'),
    syncEnabled: z.boolean().default(true),
  })
  .prefault({});
const settings = ref(Settings.parse(getVariables({ type: 'script' })));
watch(settings, val => replaceVariables(klona(val), { type: 'script' }), { deep: true });

const localDeviceId = stableDeviceId();
const localDeviceName = guessDeviceName();

const isRunning = ref(false);
const lastSyncInfo = ref('');
const _s = {
  pollTimer: null as ReturnType<typeof setInterval> | null,
  lastActionAt: 0,
  lastInteractAt: Date.now(),
  syncing: false,
  lastCharFp: '',
  lastWbFp: '',
};

function onUserInteract() {
  _s.lastInteractAt = Date.now();
}
const interactEvents = ['click', 'keydown', 'scroll', 'touchstart'] as const;
function startInteractTracking() {
  for (const evt of interactEvents)
    window.parent.document.addEventListener(evt, onUserInteract, { capture: true, passive: true });
}
function stopInteractTracking() {
  for (const evt of interactEvents) window.parent.document.removeEventListener(evt, onUserInteract, { capture: true });
}
function isIdle(): boolean {
  if (document.visibilityState === 'hidden') return true;
  return Date.now() - _s.lastInteractAt > settings.value.idleMinutes * 60 * 1000;
}

function localChatFingerprint(): string {
  const chat = SillyTavern.chat;
  if (!chat || chat.length === 0) return '0:empty';
  const last = chat[chat.length - 1];
  const mes = last?.mes ?? '';
  return `${chat.length}:${mes.length}:${mes.slice(0, 100)}|${mes.slice(-100)}`;
}

async function fetchRemoteFingerprint(): Promise<string | null> {
  try {
    const chatId = SillyTavern.getCurrentChatId();
    const charName = getCurrentCharacterName();
    if (!chatId || !charName) return null;
    const avatar = SillyTavern.characters.find(c => c.name === charName)?.avatar;
    if (!avatar) return null;
    const resp = await fetch('/api/chats/get', {
      method: 'POST',
      headers: SillyTavern.getRequestHeaders(),
      body: JSON.stringify({ ch_name: charName, file_name: chatId, avatar_url: avatar }),
    });
    if (!resp.ok) return null;
    const messages: any[] = await resp.json();
    if (!messages || messages.length === 0) return '0:empty';
    const last = messages[messages.length - 1];
    const mes: string = last?.mes ?? '';
    return `${messages.length}:${mes.length}:${mes.slice(0, 100)}|${mes.slice(-100)}`;
  } catch (e) {
    console.warn('[雲端同步] 拉取遠端聊天失敗:', e);
    return null;
  }
}

// 角色卡指紋：直接從伺服器 API 讀取，繞過記憶體快取
async function fetchCharFingerprint(): Promise<string | null> {
  try {
    const charName = getCurrentCharacterName();
    if (!charName) return null;
    const avatar = SillyTavern.characters.find(c => c.name === charName)?.avatar;
    if (!avatar) return null;
    // 用 /api/characters/get 直接從磁碟讀取角色卡 JSON
    const resp = await fetch('/api/characters/get', {
      method: 'POST',
      headers: SillyTavern.getRequestHeaders(),
      body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!resp.ok) return null;
    const charData = await resp.json();
    const desc: string = charData?.data?.description ?? charData?.description ?? '';
    const altGreetings: number = charData?.data?.alternate_greetings?.length ?? 0;
    const regexCount: number = charData?.data?.extensions?.regex_scripts?.length ?? 0;
    const charBook: number = charData?.data?.character_book?.entries?.length ?? 0;
    const sysPrompt: string = charData?.data?.system_prompt ?? '';
    return `${desc.length}:${altGreetings}:${regexCount}:${charBook}:${sysPrompt.length}:${desc.slice(0, 80)}`;
  } catch (e) {
    console.warn('[雲端同步] 讀取角色卡失敗:', e);
    return null;
  }
}

// 世界書指紋：用 SillyTavern.loadWorldInfo 從磁碟重新載入
async function fetchWbFingerprint(): Promise<string | null> {
  try {
    const charName = getCurrentCharacterName();
    if (!charName) return null;
    const globalWbs = getGlobalWorldbookNames();
    const charWbs = getCharWorldbookNames('current');
    const allNames = [...globalWbs, charWbs.primary, ...charWbs.additional].filter(Boolean) as string[];
    const parts: string[] = [];
    for (const name of allNames) {
      try {
        // loadWorldInfo 從磁碟重新讀取世界書 JSON
        const rawData = await SillyTavern.loadWorldInfo(name);
        if (!rawData?.entries) {
          parts.push(`${name}:null`);
          continue;
        }
        const entries = Object.values(rawData.entries) as any[];
        const enabledCount = entries.filter((e: any) => !e.disable).length;
        const contentLen = entries.reduce((sum: number, e: any) => sum + (e.content?.length ?? 0), 0);
        parts.push(`${name}:${entries.length}:${enabledCount}:${contentLen}`);
      } catch {
        parts.push(`${name}:err`);
      }
    }
    return parts.join('|');
  } catch {
    return null;
  }
}

async function poll() {
  if (_s.syncing) return;
  if (!isIdle()) return;
  if (Date.now() - _s.lastActionAt < settings.value.localCooldownSec * 1000) return;
  if (SillyTavern.streamingProcessor?.isFinished === false) return;
  if (!settings.value.syncEnabled) return;

  const localFp = localChatFingerprint();
  const remoteFp = await fetchRemoteFingerprint();
  const chatChanged = remoteFp !== null && localFp !== remoteFp;
  const charFp = await fetchCharFingerprint();
  const charChanged = charFp !== null && _s.lastCharFp !== '' && _s.lastCharFp !== charFp;
  if (charFp !== null) _s.lastCharFp = charFp;
  const wbFp = await fetchWbFingerprint();
  const wbChanged = wbFp !== null && _s.lastWbFp !== '' && _s.lastWbFp !== wbFp;
  if (wbFp !== null) _s.lastWbFp = wbFp;
  if (!chatChanged && !charChanged && !wbChanged) return;

  const changed = [chatChanged && '聊天', charChanged && '角色卡', wbChanged && '世界書'].filter(Boolean).join('、');
  console.info(`[雲端同步] 偵測到遠端變化：${changed}`);
  lastSyncInfo.value = `${new Date().toLocaleTimeString()} ${changed}已變更，同步中...`;
  _s.syncing = true;
  if (charChanged || wbChanged) {
    window.location.reload();
  } else {
    try {
      await SillyTavern.reloadCurrentChat();
      lastSyncInfo.value = `${new Date().toLocaleTimeString()} 聊天已同步`;
      toastr.info('已從其他設備同步聊天', '雲端同步');
    } catch (e) {
      console.error('[雲端同步] reloadCurrentChat 失敗:', e);
      window.location.reload();
    } finally {
      _s.syncing = false;
    }
  }
}

function markLocalAction() {
  if (_s.syncing) return;
  _s.lastActionAt = Date.now();
}
const listeners: EventOnReturn[] = [];
function startListeners() {
  listeners.push(
    eventOn(tavern_events.MESSAGE_SENT, markLocalAction),
    eventOn(tavern_events.MESSAGE_RECEIVED, markLocalAction),
    eventOn(tavern_events.MESSAGE_EDITED, markLocalAction),
    eventOn(tavern_events.MESSAGE_DELETED, markLocalAction),
    eventOn(tavern_events.MESSAGE_SWIPED, markLocalAction),
    eventOn(tavern_events.GENERATION_STARTED, markLocalAction),
    eventOn(tavern_events.GENERATION_ENDED, markLocalAction),
    eventOn(tavern_events.CHARACTER_EDITED, markLocalAction),
    eventOn(tavern_events.WORLDINFO_UPDATED, markLocalAction),
    eventOn(tavern_events.CHAT_CHANGED, markLocalAction),
  );
}
function stopListeners() {
  listeners.forEach(l => l.stop());
  listeners.length = 0;
}

async function start() {
  if (isRunning.value) return;
  isRunning.value = true;
  const charFp = await fetchCharFingerprint();
  if (charFp) _s.lastCharFp = charFp;
  const wbFp = await fetchWbFingerprint();
  if (wbFp) _s.lastWbFp = wbFp;
  startListeners();
  startInteractTracking();
  _s.pollTimer = setInterval(() => errorCatched(poll)(), settings.value.intervalSec * 1000);
  console.info(`[雲端同步] 已啟動，間隔 ${settings.value.intervalSec} 秒，設備 ${localDeviceName}(${localDeviceId})`);
}
function stop() {
  if (!isRunning.value) return;
  isRunning.value = false;
  if (_s.pollTimer) {
    clearInterval(_s.pollTimer);
    _s.pollTimer = null;
  }
  stopListeners();
  stopInteractTracking();
  console.info('[雲端同步] 已停止');
}
function toggle() {
  if (isRunning.value) stop();
  else start();
}
watch(
  () => settings.value.intervalSec,
  () => {
    if (isRunning.value) {
      stop();
      start();
    }
  },
);
start();
onUnmounted(() => {
  stop();
});
</script>

<style scoped>
.cloudsync-section {
  margin-top: 12px;
  border-top: 1px solid var(--SmartThemeBorderColor);
  padding-top: 10px;
}
.cloudsync-btn-row {
  display: flex;
  margin-bottom: 6px;
}
.cloudsync-btn {
  white-space: nowrap;
  writing-mode: horizontal-tb;
  width: auto;
}
.cloudsync-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.cloudsync-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--SmartThemeBorderColor);
  flex-shrink: 0;
  transition: background-color 0.3s;
}
.cloudsync-dot.active {
  background-color: #2196f3;
  box-shadow: 0 0 6px #2196f3;
}
.cloudsync-hint {
  font-size: 12px;
  color: var(--SmartThemeEmColor);
  font-style: italic;
  margin: 0 0 10px 0;
}
.cloudsync-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.cloudsync-input {
  width: 60px;
  text-align: center;
}
.cloudsync-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 6px;
  user-select: none;
}
</style>
