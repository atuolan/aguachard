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
        <template v-if="settings.streamMode === 'pip'"
          >📌 PiP 模式：不搶音樂。請先點小窗的 🖼 手動進入子母畫面再切出去，上滑不一定會自動進入</template
        >
        <template v-else>🎵 音頻模式：佔鎖屏媒體控制欄，保活最穩，會暫停背景音樂</template>
      </p>
      <p v-if="settings.streamMode === 'pip' && isIOS" class="keepalive-hint keepalive-warn">
        ⚠️ iOS：子母畫面小窗開著時可保活，但鎖屏後小窗會暫停、生成可能中斷。需要關螢幕等待請改用 🎵 音頻模式
      </p>
      <div class="keepalive-btn-row">
        <button class="menu_button keepalive-btn" @click="toggle">{{ isPlaying ? '⏹ 停止保活' : '▶ 啟動保活' }}</button>
      </div>
      <div class="keepalive-section">
        <div style="margin-bottom: 8px">保活模式：</div>
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.streamMode" type="radio" value="audio" @change="onModeChange" /> 🎵
          音頻模式（保活最穩，可鎖屏）</label
        >
        <label class="keepalive-checkbox-label"
          ><input v-model="settings.streamMode" type="radio" value="pip" @change="onModeChange" /> 📌 PiP
          影片模式（不搶音樂，iOS 需保持亮屏）</label
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

const KEEPALIVE_VERSION = 'v2';
console.info(`[保活] 腳本已加載 ${KEEPALIVE_VERSION}`);

const SILENT_AUDIO_URL = 'https://bqb.aguacloud.uk/%E7%84%A1%E8%81%B2%E9%9F%B3%E9%A0%BB10%E5%88%86%E9%90%98.m4a';
// H.264 Baseline、854×480 5fps、10 分鐘、215 KB
// 必須保留（靜音的）音軌：iOS 對無音軌影片會以 NotSupportedError 拒絕 PiP
const SILENT_VIDEO_URL = 'https://aguacloudreve.aguacloud.uk/f/gOpIR/pip%E4%BF%9D%E6%B4%BB_silent_audio.mp4';
// 收起後的小頁籤尺寸（與劇情走向助手的頁籤一致）
const TAB_W = 96;
const TAB_H = 36;
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
let initialSettings: z.infer<typeof Settings>;
try {
  initialSettings = Settings.parse(getVariables({ type: 'script' }) ?? {});
} catch (e) {
  console.warn('[保活] settings 解析失敗，使用默認值:', e);
  initialSettings = Settings.parse({});
}
const settings = ref(initialSettings);
watch(settings, val => replaceVariables(klona(val), { type: 'script' }), { deep: true });

const isPlaying = ref(false);

// iPadOS 桌面模式的 UA 是 Macintosh，用觸控點數區分
const isIOS = (() => {
  const nav = window.parent.navigator;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
})();

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

// 控制中心／鎖屏「正在播放」顯示的名稱。
// 要用播放元素所在視窗自己的 MediaMetadata，跨 iframe 混用建構子會拋錯
function setMediaSessionTitle(win: Window) {
  try {
    if (!('mediaSession' in win.navigator)) return;
    win.navigator.mediaSession.metadata = new (win as any).MediaMetadata({ title: '酒館', artist: '保活中' });
  } catch (e) {
    console.warn('[保活] 設定媒體名稱失敗:', e);
  }
}

// ---------- PiP 影片保活 ----------
function startPipVideo() {
  if (S.pipVideoEl) return;
  try {
    const parentJQ = (window.parent as any).jQuery || $;
    parentJQ('#keepalive-pip-dialog').remove();

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
          <span class="pip-collapse" style="cursor:pointer;font-size:14px;" title="縮小到角落">➖</span>
          <span class="pip-close" style="cursor:pointer;font-size:14px;" title="停止保活">✕</span>
        </div>
      </div>
      <div class="pip-body" style="position:relative;">
        <video playsinline autopictureinpicture loop muted preload="auto" style="width:100%;display:block;"></video>
        <div class="pip-cta" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:rgba(0,0,0,0.55);color:#fff;font-size:13px;text-align:center;cursor:pointer;">
          <span class="pip-cta-icon" style="font-size:26px;">🖼</span>
          <span class="pip-cta-title">點這裡開啟子母畫面</span>
          <span class="pip-cta-sub" style="font-size:11px;opacity:0.75;">開啟後才算真正保活</span>
        </div>
        <div class="pip-pill" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;gap:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;cursor:pointer;user-select:none;">
          <span class="pip-pill-dot" style="width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0;"></span>
          <span>📌 保活</span>
        </div>
      </div>
    `;

    const video = dialog.querySelector('video')!;
    video.src = SILENT_VIDEO_URL;

    // 所有 click handler 都綁在父頁面 DOM 元素上，確保 user activation 有效
    dialog.querySelector('.pip-close')!.addEventListener('click', () => stop());
    const wv = video as any;
    const cta = dialog.querySelector<HTMLElement>('.pip-cta')!;
    const isInPip = () =>
      (pDoc as any).pictureInPictureElement === video || wv.webkitPresentationMode === 'picture-in-picture';
    // 環境不支援時不再重複報錯，直接把提示層改成說明
    let unsupported = false;
    // PiP 開不了但影片有聲播放中：已由媒體播放接手保活
    let audioFallback = false;
    const showAudioFallbackHint = () => {
      cta.querySelector<HTMLElement>('.pip-cta-icon')!.textContent = '🎵';
      cta.querySelector('.pip-cta-title')!.textContent = '子母畫面無法開啟';
      cta.querySelector('.pip-cta-sub')!.textContent = '下拉控制中心，有「酒館」在播放就代表保活已生效';
    };
    const markUnsupported = (reason: string) => {
      unsupported = true;
      cta.querySelector('.pip-cta-title')!.textContent = '此環境不支援子母畫面';
      cta.querySelector('.pip-cta-sub')!.textContent = reason;
      cta.querySelector<HTMLElement>('.pip-cta-icon')!.textContent = '🚫';
    };
    const diagnose = () => {
      const pWin = window.parent as any;
      const standalone = pWin.navigator.standalone === true || pWin.matchMedia?.('(display-mode: standalone)').matches;
      return {
        standalone,
        pictureInPictureEnabled: (pDoc as any).pictureInPictureEnabled,
        webkitPiP: wv.webkitSupportsPresentationMode?.('picture-in-picture'),
        readyState: video.readyState,
        // iOS 疑似要求影片有音軌才允許 PiP
        hasAudio: wv.webkitHasAudio ?? wv.mozHasAudio ?? wv.audioTracks?.length,
        networkState: video.networkState,
        mediaError: video.error?.code,
        ua: pWin.navigator.userAgent,
      };
    };
    const togglePip = async () => {
      if (unsupported) {
        toastr.warning('此環境不支援子母畫面，請改用 🎵 音頻模式');
        return;
      }
      try {
        if ((pDoc as any).pictureInPictureElement || wv.webkitPresentationMode === 'picture-in-picture') {
          if ((pDoc as any).pictureInPictureElement) await (pDoc as any).exitPictureInPicture();
          else wv.webkitSetPresentationMode('inline');
          return;
        }
        // iOS 要求非 muted 才能進入 PiP
        video.muted = false;
        video.volume = 0.001;
        setMediaSessionTitle(window.parent);
        if (video.paused) void video.play().catch(() => {});
        if (typeof video.requestPictureInPicture === 'function') {
          try {
            await video.requestPictureInPicture();
            return;
          } catch (e) {
            // 標準 API 失敗時，iOS 舊版 API 有時仍可用
            if (!wv.webkitSupportsPresentationMode?.('picture-in-picture')) throw e;
          }
        }
        if (wv.webkitSupportsPresentationMode?.('picture-in-picture')) {
          wv.webkitSetPresentationMode('picture-in-picture');
          return;
        }
        throw new DOMException('no PiP API', 'NotSupportedError');
      } catch (e) {
        const info = diagnose();
        // 攤平成字串，酒館的日誌轉發只會顯示字串部分
        console.warn(
          `[保活] PiP 切換失敗: ${e} | standalone=${info.standalone} pipEnabled=${info.pictureInPictureEnabled} ` +
            `webkitPiP=${info.webkitPiP} readyState=${info.readyState} hasAudio=${info.hasAudio} err=${info.mediaError}`,
        );
        if ((e as DOMException)?.name !== 'NotSupportedError') {
          toastr.warning('子母畫面開啟失敗，請再點一次');
        } else if (info.readyState === 0 || info.mediaError) {
          toastr.warning('保活影片載入失敗，請檢查網路後重新啟動保活');
        } else if (!video.paused && !video.muted) {
          // iOS 主畫面 PWA 不給開 PiP，但影片已取消靜音在播放，靠媒體播放一樣能保活
          audioFallback = true;
          showAudioFallbackHint();
          syncPill();
          toastr.info('子母畫面無法開啟，請下拉控制中心，看到「酒館」正在播放就代表保活已生效', '📌 PiP 保活', {
            timeOut: 8000,
          });
        } else {
          markUnsupported('請改用 🎵 音頻模式，或用 Safari 開啟');
          toastr.warning('此環境不支援子母畫面，請改用 🎵 音頻模式');
        }
      }
    };
    dialog.querySelector('.pip-enter')!.addEventListener('click', togglePip);
    cta.addEventListener('click', togglePip);
    // 提示層跟著實際 PiP 狀態顯示/隱藏，退出子母畫面後會再出現提醒
    const syncCta = () => {
      cta.style.display = collapsed || isInPip() ? 'none' : 'flex';
    };
    video.addEventListener('enterpictureinpicture', syncCta);
    video.addEventListener('leavepictureinpicture', syncCta);
    video.addEventListener('webkitpresentationmodechanged', syncCta);
    cta.querySelector<HTMLElement>('.pip-cta-icon')!.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
      { duration: 1200, iterations: Infinity },
    );

    // ---- 縮小成角落小頁籤 ----
    // 關鍵：收起時仍保留 <video> 在 DOM 且維持可見（只是縮到頁籤大小），
    // 一旦把它移除或 display:none，PiP 會被系統關掉、保活也跟著失效
    const header = dialog.querySelector<HTMLElement>('.pip-header')!;
    const body = dialog.querySelector<HTMLElement>('.pip-body')!;
    const pill = dialog.querySelector<HTMLElement>('.pip-pill')!;
    const pillDot = dialog.querySelector<HTMLElement>('.pip-pill-dot')!;
    let collapsed = false;
    const setCollapsed = (next: boolean) => {
      collapsed = next;
      header.style.display = next ? 'none' : 'flex';
      pill.style.display = next ? 'flex' : 'none';
      cta.style.display = next || isInPip() ? 'none' : 'flex';
      dialog.style.width = next ? `${TAB_W}px` : 'min(240px,80vw)';
      body.style.height = next ? `${TAB_H}px` : '';
      video.style.height = next ? '100%' : '';
      video.style.objectFit = next ? 'cover' : '';
      try {
        parentJQ(dialog).resizable('option', 'disabled', next);
      } catch (_e) {
        /* resizable 尚未初始化 */
      }
      if (next) keepInViewport();
    };
    // 收起後若貼齊在畫面外，拉回可視範圍
    const keepInViewport = () => {
      const maxLeft = window.parent.innerWidth - TAB_W - 4;
      const maxTop = window.parent.innerHeight - TAB_H - 4;
      dialog.style.left = `${Math.min(Math.max(4, dialog.offsetLeft), Math.max(4, maxLeft))}px`;
      dialog.style.top = `${Math.min(Math.max(4, dialog.offsetTop), Math.max(4, maxTop))}px`;
    };
    dialog.querySelector('.pip-collapse')!.addEventListener('click', () => setCollapsed(true));
    // 小頁籤：點擊展開（拖動時不觸發）
    let pillMoved = false;
    pill.addEventListener('pointerdown', () => (pillMoved = false));
    pill.addEventListener('pointermove', () => (pillMoved = true));
    pill.addEventListener('click', () => {
      if (!pillMoved) setCollapsed(false);
    });
    // 小頁籤上的圓點顯示是否真的在子母畫面中
    const syncPill = () => {
      const color = isInPip() ? '#4caf50' : audioFallback && !video.paused ? '#e8a33d' : '#888';
      pillDot.style.background = color;
      pillDot.style.boxShadow = color === '#888' ? 'none' : `0 0 6px ${color}`;
    };
    video.addEventListener('enterpictureinpicture', syncPill);
    video.addEventListener('leavepictureinpicture', syncPill);
    video.addEventListener('webkitpresentationmodechanged', syncPill);

    pDoc.body.appendChild(dialog);

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
      $d.draggable({ handle: '.pip-header, .pip-pill', containment: 'window' });
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
  // 影片建在父頁面，PiP 狀態也掛在父頁面的 document 上
  const pDoc = window.parent.document;
  if (pDoc.pictureInPictureElement === S.pipVideoEl) pDoc.exitPictureInPicture().catch(() => {});
  S.pipVideoEl.pause();
  if ('mediaSession' in window.parent.navigator) window.parent.navigator.mediaSession.metadata = null;
  S.pipVideoEl.removeAttribute('src');
  S.pipVideoEl.load();
  const parentJQ = (window.parent as any).jQuery || $;
  parentJQ('#keepalive-pip-dialog').remove();
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
  setMediaSessionTitle(window);
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
  if (mode === 'pip') toastr.info('請點小窗開啟子母畫面，開啟後才算真正保活', '📌 PiP 保活');
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
// 取得可用的 ServiceWorkerRegistration（移動端 Android Chrome / iOS PWA 只能透過它發通知）
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const sw = (window.parent as any)?.navigator?.serviceWorker ?? (navigator as any)?.serviceWorker;
    if (!sw) return null;
    const reg = await sw.getRegistration();
    if (reg) return reg;
    // 沒有註冊時 ready 永遠不會 resolve，加逾時避免通知無聲卡死
    return await Promise.race([sw.ready, new Promise<null>(resolve => setTimeout(() => resolve(null), 3000))]);
  } catch {
    return null;
  }
}

// 統一發通知：優先 SW.showNotification（移動端唯一可靠），失敗再回退 new Notification（桌面）
async function showNotification(title: string, options: NotificationOptions) {
  const reg = await getSwRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    try {
      await reg.showNotification(title, options);
      console.info('[保活] 通知已送出（Service Worker）');
      return;
    } catch (e) {
      console.warn('[保活] SW 通知失敗，回退 Notification:', e);
    }
  }
  console.info(`[保活] 無可用 Service Worker（reg=${!!reg}），改用 new Notification`);
  try {
    const n = new NotificationAPI(title, options);
    n.onclick = (e: Event) => {
      e.preventDefault();
      window.parent.focus();
      n.close();
    };
  } catch (e) {
    console.warn('[保活] Notification 構造失敗（移動端需 SW）:', e);
  }
}

async function requestNotify() {
  if (!NotificationAPI) {
    toastr.warning('此瀏覽器不支援通知');
    return;
  }
  const result = await NotificationAPI.requestPermission();
  notifyPermission.value = result;
  const sw = (window.parent as any)?.navigator?.serviceWorker;
  const reg = sw ? await sw.getRegistration().catch(() => null) : null;
  // 攤平成字串，酒館的日誌轉發只會顯示字串部分
  console.info(
    `[保活] 測試通知：權限=${result} SW支援=${!!sw} SW註冊=${!!reg} SW狀態=${reg?.active?.state ?? '無'} ` +
      `scope=${reg?.scope ?? '無'} standalone=${(window.parent.navigator as any).standalone === true}`,
  );
  if (result === 'granted')
    await showNotification('保活通知已開啟', { body: 'AI 生成完畢時會通知你', icon: '/favicon.ico' });
}
function sendNotification() {
  if (!settings.value.notifyEnabled) return;
  // 即時讀取權限：載入時的快照可能已過期（例如重裝 PWA 後權限被重置）
  if (NotificationAPI) notifyPermission.value = NotificationAPI.permission;
  if (notifyPermission.value !== 'granted') {
    console.info(`[保活] 未發通知：權限為 ${NotificationAPI ? notifyPermission.value : '不支援通知 API'}`);
    return;
  }
  // 頁面在前台可見時不打擾，只在切到後台/鎖屏時通知
  if (document.visibilityState === 'visible' && window.parent.document.visibilityState === 'visible') {
    console.info('[保活] 未發通知：頁面仍在前台');
    return;
  }
  const charName = getCurrentCharacterName() ?? 'TA';
  void showNotification(`${charName} 回應你了`, { body: '我們的故事還在延續...', icon: '/favicon.ico' });
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
.keepalive-warn {
  color: #e8a33d;
  font-style: normal;
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
