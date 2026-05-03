<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>保活</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="keepalive-status-row">
        <span class="keepalive-dot" :class="{ active: isPlaying }"></span>
        <span>{{ isPlaying ? '保活中' : '未啟動' }}</span>
      </div>
      <p class="keepalive-hint">
        <template v-if="settings.streamMode === 'pip'">📌 PiP 模式：上滑自動進入子母畫面，不搶音樂，保活強</template>
        <template v-else>🎵 音頻模式：佔鎖屏媒體控制欄，保活強度較高</template>
      </p>
      <div class="keepalive-btn-row">
        <button class="menu_button keepalive-btn" @click="toggle">{{ isPlaying ? '⏹ 停止保活' : '▶ 啟動保活' }}</button>
      </div>
      <div class="keepalive-section">
        <div style="margin-bottom: 8px">保活模式：</div>
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.streamMode" type="radio" value="audio" @change="onModeChange" /> 🎵
          音頻模式（佔鎖屏媒體控制欄，保活較強）</label
        >
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.streamMode" type="radio" value="pip" @change="onModeChange" /> 📌 PiP
          影片模式（不搶音樂，上滑自動 PiP）</label
        >
      </div>
      <div class="keepalive-section">
        <div class="keepalive-status-row">
          <span
            class="keepalive-dot"
            :class="{ active: settings.notifyEnabled && notifyPermission === 'granted' }"
          ></span>
          <span>生成完畢通知：{{ settings.notifyEnabled ? notifyLabel : '已關閉' }}</span>
        </div>
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.notifyEnabled" type="checkbox" /> 啟用 PWA 推播通知</label
        >
        <p class="keepalive-hint">iOS 需加到主畫面以 PWA 模式開啟才能收到鎖屏通知</p>
        <div class="keepalive-btn-row">
          <button
            class="menu_button keepalive-btn"
            :disabled="!settings.notifyEnabled || notifyPermission === 'denied'"
            @click="requestNotify"
          >
            {{
              notifyPermission === 'granted'
                ? '✅ 已授權'
                : notifyPermission === 'denied'
                  ? '🚫 已拒絕（請至系統設定開啟）'
                  : '🔔 申請通知權限'
            }}
          </button>
        </div>
      </div>
      <div class="keepalive-section">
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.showQrButton" type="checkbox" /> 在 QR 顯示保活按鈕</label
        >
        <p class="keepalive-hint">啟用後，QR 欄會出現「▶ 啟動保活」/「⏹ 停止保活」按鈕，狀態與實際保活同步</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { klona } from 'klona';
import { computed, onUnmounted, ref, watch } from 'vue';

const SILENT_AUDIO_URL = 'https://bqb.aguacloud.uk/%E7%84%A1%E8%81%B2%E9%9F%B3%E9%A0%BB10%E5%88%86%E9%90%98.m4a';
const SILENT_VIDEO_URL = 'https://bqb.aguacloud.uk/Video%20Project%207.mp4';
const QR_BUTTON_NAME = '▶ 啟動保活';
const QR_BUTTON_NAME_STOP = '⏹ 停止保活';

const Settings = z
  .object({
    showQrButton: z.boolean().default(false),
    streamMode: z.enum(['audio', 'pip']).default('audio').catch('audio'),
    keepAliveEnabled: z.boolean().default(false),
    notifyEnabled: z.boolean().default(false),
  })
  .prefault({});
const savedSettings = getVariables({ type: 'script' }) ?? {};
const settings = ref(Settings.parse(savedSettings));
watch(settings, val => replaceVariables(klona(val), { type: 'script' }), { deep: true });

const isPlaying = ref(false);

// 用物件包裝可變狀態，避免 Vue <script setup> 把 let 編譯成 const
const S = {
  audioCtx: null as AudioContext | null,
  oscillator: null as OscillatorNode | null,
  gainNode: null as GainNode | null,
  silentAudioEl: null as HTMLAudioElement | null,
  heartbeatWorker: null as Worker | null,
  workerBlobUrl: null as string | null,
  webLockAbortController: null as AbortController | null,
  broadcastChannel: null as BroadcastChannel | null,
  broadcastTimer: null as ReturnType<typeof setInterval> | null,
  userInteracted: false,
  pipVideoEl: null as HTMLVideoElement | null,
};

// ---------- PiP 影片保活 ----------
function startPipVideo() {
  if (S.pipVideoEl) return;
  try {
    const parentJQ = (window.parent as any).jQuery || $;
    parentJQ('#keepalive-pip-dialog').remove();
    parentJQ('#keepalive-pip-ball').remove();

    // 直接用父頁面 DOM 建立所有元素，確保 click 事件是父頁面的 user activation
    const pDoc = window.parent.document;
    const dialog = pDoc.createElement('div');
    dialog.id = 'keepalive-pip-dialog';
    dialog.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(240px,80vw);max-width:80vw;z-index:2147483647;background:#1a1a2e;border:2px solid #666;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.6);';
    dialog.innerHTML = `
      <div class="pip-header" style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;cursor:move;background:#222;border-bottom:1px solid #444;font-size:12px;color:#ccc;user-select:none;">
        <span>📌 PiP 保活</span>
        <div style="display:flex;gap:8px;">
          <span class="pip-enter" style="cursor:pointer;font-size:14px;" title="子母畫面">🖼</span>
          <span class="pip-minimize" style="cursor:pointer;font-size:14px;" title="縮小成小球">⚫</span>
          <span class="pip-close" style="cursor:pointer;font-size:14px;" title="停止保活">✕</span>
        </div>
      </div>
      <video controls playsinline autopictureinpicture loop muted preload="auto" style="width:100%;display:block;"></video>
    `;

    const ball = pDoc.createElement('div');
    ball.id = 'keepalive-pip-ball';
    ball.style.cssText =
      'display:none;position:fixed;bottom:16px;right:16px;width:40px;height:40px;z-index:2147483647;background:#4caf50;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;align-items:center;justify-content:center;';
    ball.innerHTML =
      '<span style="font-size:18px;line-height:40px;text-align:center;display:block;width:100%;">📌</span>';
    ball.title = '展開 PiP 保活';

    const video = dialog.querySelector('video')!;
    video.src = SILENT_VIDEO_URL;

    // 所有 click handler 都綁在父頁面 DOM 元素上，確保 user activation 有效
    dialog.querySelector('.pip-close')!.addEventListener('click', () => stop());
    dialog.querySelector('.pip-enter')!.addEventListener('click', async () => {
      try {
        if ((pDoc as any).pictureInPictureElement) {
          await (pDoc as any).exitPictureInPicture();
        } else if (typeof video.requestPictureInPicture === 'function') {
          // iOS 要求非 muted 才能進入 PiP
          video.muted = false;
          video.volume = 0.001;
          if (video.paused) await video.play();
          await video.requestPictureInPicture();
        }
      } catch (e) {
        console.warn('[保活] PiP 切換失敗:', e);
      }
    });
    dialog.querySelector('.pip-minimize')!.addEventListener('click', () => {
      dialog.style.display = 'none';
      ball.style.display = 'flex';
    });
    ball.addEventListener('click', () => {
      ball.style.display = 'none';
      dialog.style.display = '';
    });

    pDoc.body.appendChild(dialog);
    pDoc.body.appendChild(ball);

    // 穩定播放：muted + loop，不會被 iOS 打斷
    video.addEventListener(
      'canplay',
      () => {
        video
          .play()
          .then(() => console.info('[保活] PiP 影片已啟動播放'))
          .catch(e => console.warn('[保活] PiP 影片播放失敗:', e));
      },
      { once: true },
    );

    // jQuery UI 拖動 + 縮放
    try {
      const $d = parentJQ(dialog);
      $d.draggable({ handle: '.pip-header', containment: 'window' });
      $d.resizable({ minWidth: 120, minHeight: 80, handles: 'se' });
      dialog.style.transform = 'none';
      dialog.style.top = Math.max(0, (window.parent.innerHeight - dialog.offsetHeight) / 2) + 'px';
      dialog.style.left = Math.max(0, (window.parent.innerWidth - dialog.offsetWidth) / 2) + 'px';
    } catch (_e) {
      console.warn('[保活] jQuery UI 拖動/縮放初始化失敗');
    }

    S.pipVideoEl = video;
  } catch (e) {
    console.warn('[保活] PiP 影片建立失敗:', e);
  }
}
function stopPipVideo() {
  if (!S.pipVideoEl) return;
  if (document.pictureInPictureElement === S.pipVideoEl) document.exitPictureInPicture().catch(() => {});
  S.pipVideoEl.pause();
  S.pipVideoEl.removeAttribute('src');
  S.pipVideoEl.load();
  const parentJQ = (window.parent as any).jQuery || $;
  parentJQ('#keepalive-pip-dialog').remove();
  parentJQ('#keepalive-pip-ball').remove();
  S.pipVideoEl = null;
  console.info('[保活] PiP 影片已停止');
}

// ---------- Web Lock ----------
function acquireWebLock() {
  releaseWebLock();
  if (!('locks' in navigator)) return;
  S.webLockAbortController = new AbortController();
  navigator.locks
    .request('tavern-keep-alive', { signal: S.webLockAbortController.signal }, () => new Promise<void>(() => {}))
    .catch(e => {
      if (e.name !== 'AbortError') console.warn('[保活] Web Lock 失敗:', e);
    });
}
function releaseWebLock() {
  S.webLockAbortController?.abort();
  S.webLockAbortController = null;
}

// ---------- 靜音振盪器 ----------
function startSilentOscillator() {
  if (S.audioCtx) return;
  try {
    S.audioCtx = new AudioContext();
    S.gainNode = S.audioCtx.createGain();
    S.gainNode.gain.value = 0.001;
    S.oscillator = S.audioCtx.createOscillator();
    S.oscillator.frequency.value = 1;
    S.oscillator.connect(S.gainNode);
    S.gainNode.connect(S.audioCtx.destination);
    S.oscillator.start();
    console.info('[保活] OscillatorNode 已啟動');
  } catch (e) {
    console.warn('[保活] 振盪器啟動失敗:', e);
  }
}
function stopSilentOscillator() {
  try {
    S.oscillator?.stop();
  } catch (_e) {
    /* noop */
  }
  S.oscillator?.disconnect();
  S.oscillator = null;
  S.gainNode?.disconnect();
  S.gainNode = null;
  S.audioCtx?.close().catch(() => {});
  S.audioCtx = null;
}

// ---------- 靜音 <audio> + Media Session ----------
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: '保活中', artist: 'SillyTavern' });
  navigator.mediaSession.setActionHandler('play', () => S.silentAudioEl?.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => S.silentAudioEl?.play().catch(() => {}));
}
function startSilentAudio() {
  if (S.silentAudioEl) return;
  try {
    S.silentAudioEl = new Audio(SILENT_AUDIO_URL);
    S.silentAudioEl.loop = true;
    S.silentAudioEl.volume = 0.001;
    S.silentAudioEl.addEventListener('ended', () => {
      if (isPlaying.value) S.silentAudioEl?.play().catch(() => {});
    });
    S.silentAudioEl.addEventListener('pause', () => {
      if (isPlaying.value) setTimeout(() => S.silentAudioEl?.play().catch(() => {}), 500);
    });
    S.silentAudioEl
      .play()
      .then(() => {
        setupMediaSession();
        console.info('[保活] 靜音音頻已啟動');
      })
      .catch(e => console.warn('[保活] 靜音音頻播放失敗:', e));
  } catch (e) {
    console.warn('[保活] 靜音音頻建立失敗:', e);
  }
}
function stopSilentAudio() {
  if (S.silentAudioEl) {
    S.silentAudioEl.pause();
    S.silentAudioEl.src = '';
    S.silentAudioEl.load();
    S.silentAudioEl = null;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
  }
}

function resumeIfNeeded() {
  if (!isPlaying.value) return;
  const mode = settings.value.streamMode;
  if (mode === 'pip') {
    if (S.pipVideoEl?.paused) S.pipVideoEl.play().catch(() => {});
    else if (!S.pipVideoEl) startPipVideo();
    return;
  }
  if (S.audioCtx?.state === 'suspended') S.audioCtx.resume().catch(() => {});
  else if (!S.audioCtx) startSilentOscillator();
  if (mode === 'audio') {
    if (S.silentAudioEl?.paused) S.silentAudioEl.play().catch(() => {});
    else if (!S.silentAudioEl) startSilentAudio();
  }
}
function onModeChange() {
  if (isPlaying.value) {
    stop();
    start();
  }
}

// ---------- Web Worker 心跳 ----------
function startHeartbeatWorker() {
  if (S.heartbeatWorker) return;
  const code = `let t=null;self.onmessage=e=>{if(e.data==='start')t=setInterval(()=>{self.postMessage('ping');try{fetch(self.location.origin||'/',{method:'HEAD',mode:'no-cors'}).catch(()=>{})}catch{}},15000);else if(e.data==='stop'){clearInterval(t);t=null;}};`;
  const blob = new Blob([code], { type: 'application/javascript' });
  S.workerBlobUrl = URL.createObjectURL(blob);
  S.heartbeatWorker = new Worker(S.workerBlobUrl);
  S.heartbeatWorker.onmessage = () => resumeIfNeeded();
  S.heartbeatWorker.onerror = () => {
    console.warn('[保活] 心跳 Worker 終止，重啟中');
    cleanupWorker();
    if (isPlaying.value) setTimeout(startHeartbeatWorker, 1000);
  };
  S.heartbeatWorker.postMessage('start');
}
function cleanupWorker() {
  S.heartbeatWorker?.postMessage('stop');
  S.heartbeatWorker?.terminate();
  S.heartbeatWorker = null;
  if (S.workerBlobUrl) {
    URL.revokeObjectURL(S.workerBlobUrl);
    S.workerBlobUrl = null;
  }
}

// ---------- BroadcastChannel ----------
function startBroadcastHeartbeat() {
  if (S.broadcastChannel) return;
  try {
    S.broadcastChannel = new BroadcastChannel('tavern-keepalive');
    S.broadcastChannel.onmessage = () => {
      resumeIfNeeded();
      if (!S.heartbeatWorker && isPlaying.value) startHeartbeatWorker();
    };
    S.broadcastTimer = setInterval(() => {
      try {
        S.broadcastChannel?.postMessage('heartbeat');
      } catch (_e) {
        /* noop */
      }
    }, 30000);
  } catch {
    console.warn('[保活] BroadcastChannel 不支援');
  }
}
function stopBroadcastHeartbeat() {
  if (S.broadcastTimer) {
    clearInterval(S.broadcastTimer);
    S.broadcastTimer = null;
  }
  S.broadcastChannel?.close();
  S.broadcastChannel = null;
}

// ---------- 用戶互動偵測 ----------
function onFirstInteraction() {
  if (S.userInteracted) return;
  S.userInteracted = true;
  window.parent.document.removeEventListener('click', onFirstInteraction, { capture: true });
  window.parent.document.removeEventListener('touchstart', onFirstInteraction, { capture: true });
  resumeIfNeeded();
}

// ---------- 頁面生命週期 ----------
function handleVisibility() {
  if (document.visibilityState === 'visible' && isPlaying.value) {
    resumeIfNeeded();
    if (!S.webLockAbortController) acquireWebLock();
    if (!S.heartbeatWorker) startHeartbeatWorker();
  }
}
function handleResume() {
  if (!isPlaying.value) return;
  resumeIfNeeded();
  if (!S.webLockAbortController) acquireWebLock();
  if (!S.heartbeatWorker) startHeartbeatWorker();
  if (!S.broadcastChannel) startBroadcastHeartbeat();
}

// ---------- QR 按鈕同步 ----------
function syncQrButtons(playing: boolean) {
  if (!settings.value.showQrButton) {
    updateScriptButtonsWith(buttons =>
      buttons.filter(b => b.name !== QR_BUTTON_NAME && b.name !== QR_BUTTON_NAME_STOP),
    );
    return;
  }
  updateScriptButtonsWith(buttons => [
    ...buttons.filter(b => b.name !== QR_BUTTON_NAME && b.name !== QR_BUTTON_NAME_STOP),
    { name: QR_BUTTON_NAME, visible: !playing },
    { name: QR_BUTTON_NAME_STOP, visible: playing },
  ]);
}
watch(
  () => settings.value.showQrButton,
  () => syncQrButtons(isPlaying.value),
);

// ---------- 主控 ----------
function start() {
  if (isPlaying.value) return;
  isPlaying.value = true;
  settings.value.keepAliveEnabled = true;
  acquireWebLock();
  startHeartbeatWorker();
  startBroadcastHeartbeat();
  const mode = settings.value.streamMode;
  resumeIfNeeded();
  if (!S.userInteracted) {
    window.parent.document.addEventListener('click', onFirstInteraction, { once: true, capture: true });
    window.parent.document.addEventListener('touchstart', onFirstInteraction, { once: true, capture: true });
  }
  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('resume', handleResume);
  syncQrButtons(true);
  console.info(`[保活] 已啟動（${mode} 模式）`);
}
function stop() {
  if (!isPlaying.value) return;
  isPlaying.value = false;
  settings.value.keepAliveEnabled = false;
  releaseWebLock();
  stopPipVideo();
  stopSilentOscillator();
  stopSilentAudio();
  cleanupWorker();
  stopBroadcastHeartbeat();
  window.parent.document.removeEventListener('click', onFirstInteraction, { capture: true });
  window.parent.document.removeEventListener('touchstart', onFirstInteraction, { capture: true });
  document.removeEventListener('visibilitychange', handleVisibility);
  document.removeEventListener('resume', handleResume);
  syncQrButtons(false);
  console.info('[保活] 已停止');
}
function toggle() {
  if (isPlaying.value) stop();
  else start();
}

const startListener = eventOn(getButtonEvent(QR_BUTTON_NAME), () => start());
const stopListener = eventOn(getButtonEvent(QR_BUTTON_NAME_STOP), () => stop());

// --- 推播通知 ---
const NotificationAPI = (window.parent as any)?.Notification ?? (window as any).Notification;
const notifyPermission = ref<NotificationPermission>(NotificationAPI ? NotificationAPI.permission : 'denied');
const notifyLabel = computed(() => {
  if (!NotificationAPI) return '此瀏覽器不支援';
  if (notifyPermission.value === 'granted') return '已開啟';
  if (notifyPermission.value === 'denied') return '已拒絕';
  return '未授權';
});
async function requestNotify() {
  if (!NotificationAPI) {
    toastr.warning('此瀏覽器不支援通知');
    return;
  }
  const result = await NotificationAPI.requestPermission();
  notifyPermission.value = result;
  if (result === 'granted')
    new NotificationAPI('保活通知已開啟', { body: 'AI 生成完畢時會通知你', icon: '/favicon.ico' });
}
function sendNotification() {
  if (!settings.value.notifyEnabled || notifyPermission.value !== 'granted') return;
  const charName = getCurrentCharacterName() ?? 'TA';
  const n = new NotificationAPI(`${charName} 回應你了`, { body: '我們的故事還在延續...', icon: '/favicon.ico' });
  n.onclick = (e: Event) => {
    e.preventDefault();
    window.parent.focus();
    n.close();
  };
}
const genListener = eventOn(tavern_events.GENERATION_ENDED, () => sendNotification());

window.parent.document.addEventListener('click', onFirstInteraction, { once: true, capture: true });
window.parent.document.addEventListener('touchstart', onFirstInteraction, { once: true, capture: true });
if (settings.value.keepAliveEnabled) start();

onUnmounted(() => {
  stop();
  genListener.stop();
  startListener.stop();
  stopListener.stop();
});
</script>

<style scoped>
.keepalive-section {
  margin-top: 12px;
  border-top: 1px solid var(--SmartThemeBorderColor);
  padding-top: 10px;
}
.keepalive-btn-row {
  display: flex;
  margin-bottom: 6px;
}
.keepalive-btn {
  white-space: nowrap;
  writing-mode: horizontal-tb;
  width: auto;
}
.keepalive-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.keepalive-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--SmartThemeBorderColor);
  flex-shrink: 0;
  transition: background-color 0.3s;
}
.keepalive-dot.active {
  background-color: #4caf50;
  box-shadow: 0 0 6px #4caf50;
}
.keepalive-hint {
  font-size: 12px;
  color: var(--SmartThemeEmColor);
  font-style: italic;
  margin: 0 0 10px 0;
}
.keepalive-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 6px;
  user-select: none;
}
</style>
