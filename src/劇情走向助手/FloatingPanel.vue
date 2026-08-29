<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';

// ─── 常量 ────────────────────────────────────────────────────────────────────

const SNAP_ZONE = 60;
const CLICK_SLOP = 6;
const VIEWPORT_INSET = 8;
const POS_KEY = 'intersection-panel.pos.v1';
const PROMPT_KEY = 'intersection-panel.prompt.v1';
const API_STORE_KEY = 'storyDirectionApi';
const TOGGLE_EVENT = '劇情走向助手:toggle';

interface ApiScheme {
  id: string;
  name: string;
  source: string;
  apiurl: string;
  key: string;
  model: string;
  proxy_preset?: string;
  createdAt: number;
  updatedAt: number;
}

interface ApiStore {
  version: 1;
  activeId: string;
  schemes: ApiScheme[];
}

type ApiForm = Omit<ApiScheme, 'createdAt' | 'updatedAt'>;

const EMPTY_API_STORE: ApiStore = { version: 1, activeId: '', schemes: [] };
const EMPTY_API_FORM: ApiForm = {
  id: '',
  name: '',
  source: 'openai',
  apiurl: '',
  key: '',
  model: '',
  proxy_preset: '',
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function validTimestamp(value: unknown): number | null {
  const timestamp = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function createApiSchemeId(): string {
  return `story-direction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyApiForm(): ApiForm {
  return { ...EMPTY_API_FORM };
}

function normalizeApiScheme(value: unknown): ApiScheme | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof ApiScheme, unknown>>;
  const id = requiredString(raw.id);
  const name = requiredString(raw.name);
  const source = requiredString(raw.source);
  const apiurl = requiredString(raw.apiurl);
  const key = requiredString(raw.key);
  const model = requiredString(raw.model);
  if (!id || !name || !source || !apiurl || !key || !model) return null;
  if (raw.proxy_preset !== undefined && typeof raw.proxy_preset !== 'string') return null;
  const now = Date.now();
  const proxyPreset = cleanString(raw.proxy_preset);
  return {
    id,
    name,
    source,
    apiurl,
    key,
    model,
    ...(proxyPreset ? { proxy_preset: proxyPreset } : {}),
    createdAt: validTimestamp(raw.createdAt) ?? now,
    updatedAt: validTimestamp(raw.updatedAt) ?? now,
  };
}

function normalizeApiStore(value: unknown): ApiStore {
  if (!value || typeof value !== 'object') return { ...EMPTY_API_STORE, schemes: [] };
  const raw = value as Partial<Record<keyof ApiStore, unknown>>;
  const schemes = Array.isArray(raw.schemes)
    ? raw.schemes.map(normalizeApiScheme).filter((scheme): scheme is ApiScheme => scheme !== null)
    : [];
  const activeId = cleanString(raw.activeId);
  return {
    version: 1,
    activeId: schemes.some(scheme => scheme.id === activeId) ? activeId : '',
    schemes,
  };
}

function readApiStore(): ApiStore {
  const variables = getVariables({ type: 'script' });
  return normalizeApiStore(variables?.[API_STORE_KEY]);
}

function writeApiStore(store: ApiStore): void {
  const variables = getVariables({ type: 'script' });
  replaceVariables({ ...variables, [API_STORE_KEY]: normalizeApiStore(store) }, { type: 'script' });
}

function schemeToCustomApi(scheme: ApiScheme | ApiForm): CustomApiConfig {
  const customApi: CustomApiConfig = {
    apiurl: cleanString(scheme.apiurl),
    key: cleanString(scheme.key),
    model: cleanString(scheme.model),
    source: cleanString(scheme.source) || 'openai',
  };
  const proxyPreset = cleanString(scheme.proxy_preset);
  if (proxyPreset) customApi.proxy_preset = proxyPreset;
  return customApi;
}

// 解析：每个 fork 捕获到下一个 forkN: 或 </intersection>（支持多行内容）
const PARSE_REGEX =
  /<intersection>\s*fork[１1][:：]([\s\S]*?)fork[２2][:：]([\s\S]*?)fork[３3][:：]([\s\S]*?)fork[４4][:：]([\s\S]*?)fork[５5][:：]([\s\S]*?)<\/intersection>/is;

const DEFAULT_PROMPT =
  `{{user}} 請求行動候選:於正文後列出最多五個 {{user}} 的下一步候選回應,替 {{user}} 代入扮演,而非概述劇情。

每個 fork 必須遵守:
1. 以「我」的第一人稱撰寫,如同 {{user}} 親筆寫下的回覆草稿。動作與台詞可自由交錯、可分多拍(台詞—動作—台詞),可換行、可留短句,不必套用固定模板;動作以 * * 標註。
2. 台詞須符合 {{user}} 目前的性格、語氣、情緒與所知情報;不得替 {{user}} 編造他不可能知道的資訊。
3. 每項約 30-120 字。允許口語的碎碎念、沒說完的話、言不由衷(嘴上一套、動作洩底);禁止使用「{{user}} 可以嘗試…」「或許…」等旁觀者口吻。
4. 只寫 {{user}} 的言行,不預寫 NPC 的反應或後續結果。可以寫 {{user}} 對 NPC 過往言行的觀察與猜想(如「他以後就會讓你來打發我」),此為 {{user}} 自己的想法,不算預寫。
5. fork 不得替世界或 NPC 憑空創造新事實(如 NPC 的氣味、傷病、來歷、正在發生的事件)。{{user}} 可以去試探、詢問、觀察、猜測,但不得在候選中直接斷言試探的結果。

各 fork 的方向分工:
fork1-2:當前場景的延伸,兩者的切入點與「情緒重量」須不同——不得兩個都是輕快表層的打趣。其中至少一個須寫出 {{user}} 藏在表面之下的真實情緒(委屈、不安、失落、賭氣、依戀等),允許情緒在段內遞進或轉折(如先嘴硬掩飾、後動作或後半句洩露真心),允許以自嘲或玩笑包裹心事。若正文已抵達自然收束點,不必強行拉長場景,可改為描寫收束時刻的最後一筆。
fork3:劇情推進——{{user}} 主動做出會改變當前局面的言行,為劇情開啟新方向。可以是:提出一個重大請求或提議、追問前文懸而未決的人事物、觸碰某個敏感或禁忌的話題、做出一個影響後續的決定、或起身去做一件會引發新事件的事(包含負氣之舉,如揚言離開、真的轉身就走)。優先取材自前文已埋下的伏筆或懸念。
fork4:時間/場景跳轉——推算此跳轉前,先依故事本身思考:已發生的事件會結出什麼後果?各人物依其性格、動機與處境,接下來會採取什麼行動?哪條埋下的線正在暗中運轉?據此選定一個「劇情有所發展」的時間點與場景跳過去,而非僅按日程挑一個安排好的活動。跳轉可為以下兩種之一:
  (a) 有 user:跳至該時間點,寫明跳至何時與「我」在新場景的開場言行。
  (b) 無 user:切至 {{user}} 不在場、但劇情正在發展的一幕。此為規則 1 與 4 的唯一例外,但只准寫「場景的開端」:時間、地點、在場者、正要開始發生的事;事件的過程、對話內容與結果一律留待正文展開,不得先行敘述或劇透。
  兩種跳轉都須是前文因果與人物動機的合理延伸,不得憑空捏造與前文無關的新事件;跳轉後的場景性質須與當前場景有實質差異。
fork5:留白——不強制有台詞、不強制有人,且不得跳轉時間。fork5 是「當下這一刻的停頓」:「我」沉默的動作、一個凝視、或當前時空中被忽略的環境細節。其氛圍須與正文形成對比或補充,不得複述正文已經描寫過的意象。

格式如下:
<intersection>
fork1:(動作與台詞交錯,可多拍)
fork2:(動作與台詞交錯,可多拍)
fork3:【推進】(動作與台詞交錯,可多拍)
fork4:【跳至○○·某場景】(開場描寫)
fork5:(場景或無言描寫,可無台詞、可無人物)
</intersection>`.trim();

// ─── 位置持久化 ──────────────────────────────────────────────────────────────

type Dock = 'left' | 'right' | 'none';
interface OrbPos {
  dock: Dock;
  x: number;
  y: number;
}

function loadPos(): OrbPos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<OrbPos>;
      if (p && (p.dock === 'left' || p.dock === 'right' || p.dock === 'none'))
        return { dock: p.dock, x: Number(p.x) || 0, y: Number(p.y) || 0 };
    }
  } catch {
    /* ignore */
  }
  return { dock: 'right', x: 0, y: Math.round(window.innerHeight * 0.35) };
}

function savePos() {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function loadPrompt(): string {
  try {
    return localStorage.getItem(PROMPT_KEY) || DEFAULT_PROMPT;
  } catch {
    return DEFAULT_PROMPT;
  }
}

function savePromptToStorage(text: string) {
  try {
    localStorage.setItem(PROMPT_KEY, text);
  } catch {
    /* ignore */
  }
}

// ─── 状态 ────────────────────────────────────────────────────────────────────

const pos = reactive<OrbPos>(loadPos());
const apiStore = ref<ApiStore>({ ...EMPTY_API_STORE, schemes: [] });
const apiForm = reactive<ApiForm>(emptyApiForm());
const activeScheme = computed(() => apiStore.value.schemes.find(scheme => scheme.id === apiStore.value.activeId));
const selectedCustomApi = computed<CustomApiConfig | undefined>(() =>
  activeScheme.value ? schemeToCustomApi(activeScheme.value) : undefined,
);
const isVisible = ref(true);
const isExpanded = ref(false);
const isApiSettingsOpen = ref(false);
const isPromptEditorOpen = ref(false);
const isApiKeyVisible = ref(false);
const isLoading = ref(false);
const isLoadingCurrentApi = ref(false);
const errorMsg = ref('');
const apiStatus = ref('');
const apiValidation = ref<string[]>([]);
const options = ref<string[]>([]);
const promptEditorContent = ref(loadPrompt());
const customPrompt = ref(loadPrompt());
const promptStatus = ref('');

const dragging = ref(false);
const awake = ref(false);
let activePointer: number | null = null;
let startX = 0,
  startY = 0,
  moved = 0,
  grabDX = 0,
  grabDY = 0;

const TAB_W = 96;
const TAB_H = 36;

function viewportSize() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width || window.innerWidth,
    height: viewport?.height || window.innerHeight,
  };
}

// ─── 辅助：解析 fork 标签 ────────────────────────────────────────────────────

interface ForkMeta {
  tag: string;
  body: string;
}

function parseForkMeta(raw: string): ForkMeta {
  const trimmed = raw.trim();
  // 匹配 【推進】 或 【跳至…】
  const m = trimmed.match(/^(【[^】]+】)([\s\S]*)$/);
  if (m) return { tag: m[1].trim(), body: m[2].trim() };
  return { tag: '', body: trimmed };
}

function forkTagClass(tag: string): string {
  if (!tag) return '';
  if (tag.includes('推進')) return 'tag-advance';
  if (tag.includes('跳至')) return 'tag-jump';
  return 'tag-other';
}

const FORK_LABELS = ['場景一', '場景二', '推進', '跳轉', '留白'];

// ─── 位置计算 ────────────────────────────────────────────────────────────────

function clampToViewport() {
  const { width, height } = viewportSize();
  const maxX = Math.max(VIEWPORT_INSET, width - TAB_W - VIEWPORT_INSET);
  const maxY = Math.max(VIEWPORT_INSET, height - TAB_H - VIEWPORT_INSET);
  if (pos.dock === 'right') pos.x = width - TAB_W - VIEWPORT_INSET;
  else if (pos.dock === 'left') pos.x = VIEWPORT_INSET;
  pos.x = Math.min(Math.max(VIEWPORT_INSET, pos.x), maxX);
  pos.y = Math.min(Math.max(VIEWPORT_INSET, pos.y), maxY);
}

function currentLeft(): number {
  return pos.x;
}

const tabStyle = computed(() => ({
  left: `${currentLeft()}px`,
  top: `${pos.y}px`,
  transform: 'translateX(0)',
}));

const panelStyle = computed(() => {
  const { width, height } = viewportSize();
  const narrow = width < 440;
  if (narrow) return { left: `${VIEWPORT_INSET}px`, right: `${VIEWPORT_INSET}px`, top: `${VIEWPORT_INSET}px` };

  const panelWidth = Math.min(360, width - VIEWPORT_INSET * 2);
  const tabLeft = currentLeft();
  const showRight = tabLeft + TAB_W / 2 < width / 2;
  const panelMaxHeight = Math.min(height * 0.8, height - VIEWPORT_INSET * 2);
  const maxTop = Math.max(VIEWPORT_INSET, height - panelMaxHeight - VIEWPORT_INSET);
  const top = Math.min(Math.max(VIEWPORT_INSET, pos.y), maxTop);
  return showRight
    ? { left: `${Math.min(width - panelWidth - VIEWPORT_INSET, tabLeft + TAB_W + 8)}px`, top: `${top}px` }
    : { left: `${Math.max(VIEWPORT_INSET, tabLeft - panelWidth - 8)}px`, top: `${top}px` };
});

// ─── 拖动 ────────────────────────────────────────────────────────────────────

function onDown(e: PointerEvent) {
  activePointer = e.pointerId;
  dragging.value = true;
  moved = 0;
  startX = e.clientX;
  startY = e.clientY;
  grabDX = e.clientX - currentLeft();
  grabDY = e.clientY - pos.y;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== activePointer) return;
  moved = Math.max(moved, Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY));
  pos.dock = 'none';
  pos.x = e.clientX - grabDX;
  pos.y = e.clientY - grabDY;
  clampToViewport();
}

function onUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== activePointer) return;
  dragging.value = false;
  activePointer = null;
  if (moved < CLICK_SLOP) {
    toggleExpanded();
    return;
  }
  const { width } = viewportSize();
  const left = pos.x;
  const right = width - (pos.x + TAB_W);
  if (left <= SNAP_ZONE) pos.dock = 'left';
  else if (right <= SNAP_ZONE) pos.dock = 'right';
  else pos.dock = 'none';
  clampToViewport();
  savePos();
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleExpanded();
  }
}

// ─── 面板逻辑 ────────────────────────────────────────────────────────────────

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
  if (!isExpanded.value) isPromptEditorOpen.value = false;
}

function toggleVisibility() {
  isVisible.value = !isVisible.value;
  if (!isVisible.value) {
    isExpanded.value = false;
    isPromptEditorOpen.value = false;
  }
}

function onQrToggle() {
  toggleVisibility();
}

function parseIntersection(text: string): string[] | null {
  const m = PARSE_REGEX.exec(text);
  if (!m) return null;
  return [m[1], m[2], m[3], m[4], m[5]].map(s => s.trim());
}

async function generateOptions() {
  isLoading.value = true;
  errorMsg.value = '';
  options.value = [];
  try {
    const result = await generateRaw({
      should_silence: true,
      should_stream: false,
      max_chat_history: 'all',
      ordered_prompts: [
        'char_description',
        'scenario',
        'chat_history',
        { role: 'system', content: customPrompt.value },
      ],
    });
    const text = typeof result === 'string' ? result : ((result as any).content ?? '');
    const parsed = parseIntersection(text);
    if (!parsed) throw new Error('無法解析 AI 返回的內容，請確認提示詞要求輸出 <intersection> 格式');
    options.value = parsed;
  } catch (e: any) {
    errorMsg.value = e?.message || '生成失敗，請重試';
    console.error('[劇情走向助手] 生成錯誤:', e);
  } finally {
    isLoading.value = false;
  }
}

function selectOption(text: string) {
  try {
    triggerSlash(`/setinput ${text}`);
  } catch (e) {
    console.error('[劇情走向助手] 填入輸入框失敗:', e);
  }
}

function savePrompt() {
  if (promptEditorContent.value === customPrompt.value) {
    promptStatus.value = '提示詞沒有變化，未重複保存';
    return;
  }
  customPrompt.value = promptEditorContent.value;
  savePromptToStorage(customPrompt.value);
  promptStatus.value = '提示詞已保存';
}

function resetPrompt() {
  if (promptEditorContent.value === DEFAULT_PROMPT && customPrompt.value === DEFAULT_PROMPT) {
    promptStatus.value = '提示詞已是預設內容，未重複保存';
    return;
  }
  promptEditorContent.value = DEFAULT_PROMPT;
  customPrompt.value = DEFAULT_PROMPT;
  savePromptToStorage(DEFAULT_PROMPT);
  promptStatus.value = '已恢復預設提示詞';
}

const onResize = () => {
  clampToViewport();
  savePos();
};

function loadApiForm(scheme?: ApiScheme) {
  Object.assign(apiForm, scheme ? { ...scheme } : emptyApiForm());
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function firstReadableString(record: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = cleanString(record[field]);
    if (value) return value;
  }
  return '';
}

function isMaskedApiKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes('被隐藏') ||
    normalized.includes('已隐藏') ||
    normalized.includes('masked') ||
    normalized.includes('redacted') ||
    normalized.includes('hidden') ||
    normalized.includes('censored') ||
    normalized.includes('obfuscated') ||
    /^(?:[*•·…⋯.#x_-])+$/.test(normalized)
  );
}

function firstReadableApiKey(record: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = cleanString(record[field]);
    if (value && !isMaskedApiKey(value)) return value;
  }
  return '';
}

function readCurrentMainApiForm(): { form: ApiForm; hasReadableKey: boolean } {
  const settings = objectRecord(SillyTavern.chatCompletionSettings);
  if (!settings) throw new Error('当前 Chat Completion 配置不可读');

  const key = firstReadableApiKey(settings, ['api_key', 'key', 'apiKey', 'openai_key', 'openai_api_key']);
  const source = firstReadableString(settings, [
    'custom_model_source',
    'chat_completion_source',
    'source',
    'api_type',
    'provider',
  ]);
  const apiurl = firstReadableString(settings, [
    'reverse_proxy',
    'proxy_url',
    'openai_server_url',
    'api_url',
    'apiurl',
    'endpoint',
    'base_url',
  ]);
  const model = firstReadableString(settings, ['model', 'openai_model', 'model_name', 'custom_model']);
  const proxyPreset = firstReadableString(settings, ['proxy_preset', 'proxyPreset']);
  if (!source && !apiurl && !key && !model && !proxyPreset) {
    throw new Error('当前 Chat Completion 配置为空或没有可读 API 字段');
  }

  const form: ApiForm = {
    ...emptyApiForm(),
    id: createApiSchemeId(),
    name: firstReadableString(settings, ['name', 'preset', 'preset_name', 'connection_name']) || '当前主 API 方案',
    source: source || 'openai',
    apiurl,
    key,
    model,
    proxy_preset: proxyPreset,
  };
  return { form, hasReadableKey: Boolean(key) };
}

async function loadCurrentMainApi() {
  if (isLoadingCurrentApi.value) return;
  isLoadingCurrentApi.value = true;
  apiValidation.value = [];
  apiStatus.value = '';
  await nextTick();
  try {
    const { form, hasReadableKey } = readCurrentMainApiForm();
    Object.assign(apiForm, form);
    apiStatus.value = hasReadableKey
      ? '已读取当前主 API，已准备新方案，请点击“保存方案”完成持久化'
      : '已读取当前主 API（Key 不可读），请手动补填 API Key 后点击“保存方案”';
  } catch (e: unknown) {
    apiStatus.value = '当前主 API 读取失败，已保留原表单内容';
    console.error('[劇情走向助手] 当前主 API 读取错误:', e instanceof Error ? e.message : '未知错误');
  } finally {
    isLoadingCurrentApi.value = false;
  }
}

function selectScheme(id: string) {
  apiValidation.value = [];
  if (id === apiStore.value.activeId) {
    apiStatus.value = id ? '当前已在该副 API 方案，未重复切换' : '当前已使用主 API，未重复切换';
    return;
  }
  if (id && !apiStore.value.schemes.some(scheme => scheme.id === id)) {
    apiStatus.value = '找不到所选副 API 方案，未切换';
    return;
  }
  apiStore.value = { ...apiStore.value, activeId: id };
  writeApiStore(apiStore.value);
  loadApiForm(apiStore.value.schemes.find(scheme => scheme.id === id));
  apiStatus.value = id ? '已切换并加载副 API 方案' : '已切换到主 API';
}

function startNewScheme() {
  apiValidation.value = [];
  apiStatus.value = '已准备新方案，请填写配置后保存';
  loadApiForm({ ...emptyApiForm(), id: createApiSchemeId() });
}

function validateApiForm(): string[] {
  const fields: Array<[keyof ApiForm, string]> = [
    ['name', '方案名称'],
    ['apiurl', 'API Base URL'],
    ['key', 'API Key'],
    ['model', '模型'],
  ];
  return fields.filter(([field]) => !cleanString(apiForm[field])).map(([, label]) => `请填写${label}`);
}

function saveScheme() {
  apiValidation.value = validateApiForm();
  apiStatus.value = '';
  if (apiValidation.value.length) return;

  const now = Date.now();
  const form = {
    ...apiForm,
    id: cleanString(apiForm.id) || createApiSchemeId(),
    name: cleanString(apiForm.name),
    source: cleanString(apiForm.source) || 'openai',
    apiurl: cleanString(apiForm.apiurl),
    key: cleanString(apiForm.key),
    model: cleanString(apiForm.model),
    proxy_preset: cleanString(apiForm.proxy_preset),
  };
  const existingIndex = apiStore.value.schemes.findIndex(scheme => scheme.id === form.id);
  const existing = existingIndex >= 0 ? apiStore.value.schemes[existingIndex] : undefined;
  const isUnchanged =
    existing &&
    existing.name === form.name &&
    existing.source === form.source &&
    existing.apiurl === form.apiurl &&
    existing.key === form.key &&
    existing.model === form.model &&
    cleanString(existing.proxy_preset) === form.proxy_preset;
  if (isUnchanged) {
    loadApiForm(existing);
    apiStatus.value = `方案「${existing.name}」没有变化，未重复保存`;
    return;
  }
  const savedScheme: ApiScheme = {
    ...form,
    ...(existing ? { createdAt: existing.createdAt } : { createdAt: now }),
    updatedAt: now,
  };
  const schemes = [...apiStore.value.schemes];
  if (existingIndex >= 0) schemes[existingIndex] = savedScheme;
  else schemes.push(savedScheme);
  apiStore.value = { version: 1, activeId: savedScheme.id, schemes };
  writeApiStore(apiStore.value);
  loadApiForm(savedScheme);
  apiValidation.value = [];
  apiStatus.value = `已保存方案「${savedScheme.name}」`;
}

function deleteScheme() {
  const id = cleanString(apiForm.id);
  const index = apiStore.value.schemes.findIndex(scheme => scheme.id === id);
  if (!id || index < 0) {
    apiStatus.value = '当前没有可删除的已保存方案';
    return;
  }

  const deleted = apiStore.value.schemes[index];
  const schemes = apiStore.value.schemes.filter(scheme => scheme.id !== id);
  const activeId = apiStore.value.activeId === id ? '' : apiStore.value.activeId;
  apiStore.value = { version: 1, activeId, schemes };
  writeApiStore(apiStore.value);
  loadApiForm(activeId ? schemes.find(scheme => scheme.id === activeId) : undefined);
  apiValidation.value = [];
  apiStatus.value = `已删除方案「${deleted.name}」${activeId ? '' : '，已切回主 API'}`;
}

function initializeApiStore() {
  try {
    apiStore.value = readApiStore();
    loadApiForm(activeScheme.value);
  } catch (e: unknown) {
    errorMsg.value = '副 API 配置读取失败，请稍后重试';
    console.error('[劇情走向助手] 副 API 配置读取错误:', e instanceof Error ? e.message : '未知错误');
  }
}

onMounted(() => {
  initializeApiStore();
  clampToViewport();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener(TOGGLE_EVENT, onQrToggle);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.visualViewport?.removeEventListener('resize', onResize);
  window.removeEventListener(TOGGLE_EVENT, onQrToggle);
});
</script>

<template>
  <!-- 浮动页籤 -->
  <div
    v-if="isVisible"
    class="ip-tab"
    :class="{ 'is-dragging': dragging }"
    :style="tabStyle"
    role="button"
    tabindex="0"
    aria-label="劇情走向助手"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @pointerenter="awake = true"
    @pointerleave="awake = false"
    @focus="awake = true"
    @blur="awake = false"
    @keydown="onKey"
  >
    <span class="ip-tab-icon">✦</span>
    <span class="ip-tab-label">走向</span>
  </div>

  <!-- 展开面板 -->
  <Transition v-if="isVisible" name="ip-panel-fade">
    <div v-if="isExpanded" class="ip-panel" :style="panelStyle" @pointerdown.stop>
      <!-- 标题栏 -->
      <div class="ip-panel-header">
        <h3 class="ip-panel-title">行動候選</h3>
        <button class="ip-icon-btn" aria-label="關閉" @click="toggleExpanded">✕</button>
      </div>

      <!-- 可滚动内容：标题栏固定，主体和折叠区共享一个滚动上下文 -->
      <div class="ip-panel-content">
        <!-- 主体 -->
        <div class="ip-panel-body">
          <!-- 生成按钮 -->
          <button class="ip-generate-btn" :disabled="isLoading" @click="generateOptions">
            <span v-if="isLoading" class="ip-spinner" aria-hidden="true"></span>
            <span>{{ isLoading ? '思考中⋯' : '✦ 思考回應' }}</span>
          </button>

          <!-- 错误提示 -->
          <div v-if="errorMsg" class="ip-error" role="alert">
            <span>⚠ {{ errorMsg }}</span>
          </div>

          <!-- 选项列表 -->
          <div v-if="options.length" class="ip-options">
            <button v-for="(opt, i) in options" :key="i" class="ip-option" @click="selectOption(opt)">
              <!-- fork 编号 + 标签 -->
              <div class="ip-option-head">
                <span class="ip-fork-num">{{ FORK_LABELS[i] }}</span>
                <span v-if="parseForkMeta(opt).tag" class="ip-fork-tag" :class="forkTagClass(parseForkMeta(opt).tag)">{{
                  parseForkMeta(opt).tag
                }}</span>
              </div>
              <!-- 正文（去掉已显示的 tag 前缀） -->
              <div class="ip-option-text">{{ parseForkMeta(opt).body || opt }}</div>
            </button>
          </div>
        </div>

        <!-- API 设置折叠 -->
        <div class="ip-api-section">
          <button
            class="ip-prompt-toggle"
            :aria-expanded="isApiSettingsOpen"
            @click="isApiSettingsOpen = !isApiSettingsOpen"
          >
            <span class="ip-toggle-arrow" :class="{ open: isApiSettingsOpen }">▶</span>
            <span>API 設置</span>
          </button>

          <Transition name="ip-collapse">
            <div v-if="isApiSettingsOpen" class="ip-api-settings">
              <label class="ip-field">
                <span>方案</span>
                <select
                  :value="apiStore.activeId"
                  class="ip-input"
                  @change="selectScheme(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">使用主 API</option>
                  <option v-for="scheme in apiStore.schemes" :key="scheme.id" :value="scheme.id">
                    {{ scheme.name }}
                  </option>
                </select>
              </label>
              <label class="ip-field">
                <span>方案名称</span>
                <input v-model="apiForm.name" class="ip-input" type="text" autocomplete="off" />
              </label>
              <label class="ip-field">
                <span>来源</span>
                <input v-model="apiForm.source" class="ip-input" type="text" autocomplete="off" />
              </label>
              <label class="ip-field">
                <span>API Base URL</span>
                <input v-model="apiForm.apiurl" class="ip-input" type="url" autocomplete="url" />
              </label>
              <label class="ip-field">
                <span>API Key</span>
                <span class="ip-secret-field">
                  <input
                    v-model="apiForm.key"
                    class="ip-input"
                    :type="isApiKeyVisible ? 'text' : 'password'"
                    autocomplete="off"
                  />
                  <button
                    class="ip-secret-toggle"
                    type="button"
                    :aria-label="isApiKeyVisible ? '隐藏 API Key' : '显示 API Key'"
                    @click="isApiKeyVisible = !isApiKeyVisible"
                  >
                    {{ isApiKeyVisible ? '隐藏' : '显示' }}
                  </button>
                </span>
              </label>
              <label class="ip-field">
                <span>模型</span>
                <input v-model="apiForm.model" class="ip-input" type="text" autocomplete="off" />
              </label>
              <label class="ip-field">
                <span>Proxy preset</span>
                <input v-model="apiForm.proxy_preset" class="ip-input" type="text" autocomplete="off" />
              </label>
              <div v-if="apiValidation.length" class="ip-api-validation" role="alert">
                <span v-for="message in apiValidation" :key="message">{{ message }}</span>
              </div>
              <div v-if="apiStatus" class="ip-api-status" role="status" aria-live="polite">{{ apiStatus }}</div>
              <div class="ip-api-actions">
                <button
                  class="ip-btn ip-btn-reset"
                  type="button"
                  :disabled="isLoadingCurrentApi"
                  @click="loadCurrentMainApi"
                >
                  {{ isLoadingCurrentApi ? '读取中⋯' : '从当前酒馆读取' }}
                </button>
                <button class="ip-btn ip-btn-reset" type="button" @click="startNewScheme">新增方案</button>
                <button class="ip-btn ip-btn-save" type="button" @click="saveScheme">保存方案</button>
                <button class="ip-btn ip-btn-delete" type="button" @click="deleteScheme">删除方案</button>
              </div>
              <p class="ip-api-warning">安全提示：Key 保存在脚本 data 中，导出或分享含数据的脚本可能暴露 Key。</p>
            </div>
          </Transition>
        </div>

        <!-- 提示词编辑器折叠 -->
        <div class="ip-prompt-section">
          <button
            class="ip-prompt-toggle"
            :aria-expanded="isPromptEditorOpen"
            @click="isPromptEditorOpen = !isPromptEditorOpen"
          >
            <span class="ip-toggle-arrow" :class="{ open: isPromptEditorOpen }">▶</span>
            <span>提示詞設置</span>
          </button>

          <Transition name="ip-collapse">
            <div v-if="isPromptEditorOpen" class="ip-prompt-editor">
              <textarea v-model="promptEditorContent" class="ip-textarea" rows="12" spellcheck="false"></textarea>
              <div class="ip-prompt-actions">
                <button class="ip-btn ip-btn-save" @click="savePrompt">💾 保存</button>
                <button class="ip-btn ip-btn-reset" @click="resetPrompt">↺ 恢復預設</button>
              </div>
              <div v-if="promptStatus" class="ip-prompt-status" role="status" aria-live="polite">
                {{ promptStatus }}
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── 设计令牌：跟随 ST，与 HTML 面板保持相同的 token 命名 ─── */
.ip-tab,
.ip-panel {
  --theme-fg: var(--SmartThemeBodyColor, #c8c8c8);
  --accent-soft: color-mix(in srgb, var(--theme-fg) 10%, transparent);
  --accent-border: color-mix(in srgb, var(--theme-fg) 32%, transparent);
  --accent-shadow: color-mix(in srgb, var(--theme-fg) 18%, transparent);
  --hover: color-mix(in srgb, var(--theme-fg) 8%, transparent);
  --line: color-mix(in srgb, var(--theme-fg) 14%, transparent);
  --bg: var(--SmartThemeBlurTintColor, #1c1c24);
  --border: var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1));

  /* 标签色 */
  --tag-advance-bg: color-mix(in srgb, #6abf7b 14%, transparent);
  --tag-advance-fg: #7ed98c;
  --tag-advance-border: color-mix(in srgb, #6abf7b 38%, transparent);
  --tag-jump-bg: color-mix(in srgb, #7ab4d4 14%, transparent);
  --tag-jump-fg: #8dc8e8;
  --tag-jump-border: color-mix(in srgb, #7ab4d4 38%, transparent);
}

/* ── 浮动页籤 ─── */
.ip-tab {
  position: fixed;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 5px;
  width: clamp(72px, 18vw, 96px);
  height: clamp(32px, 7vw, 36px);
  min-width: 72px;
  box-sizing: border-box;
  padding: 0 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--theme-fg);
  font-family: var(--mainFontFamily, 'Noto Sans', sans-serif);
  font-size: 13px;
  font-weight: 500;
  cursor: grab;
  touch-action: none;
  user-select: none;
  filter: drop-shadow(0 3px 8px var(--accent-shadow));
  opacity: 0.72;
  transition:
    transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.ip-tab:hover,
.ip-tab:focus-visible,
.ip-tab.is-dragging {
  opacity: 1;
}
.ip-tab:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 2px;
}
.ip-tab:active {
  cursor: grabbing;
}

.ip-tab-icon {
  font-size: 12px;
  flex-shrink: 0;
  opacity: 0.7;
}
.ip-tab-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 展开面板 ─── */
.ip-panel {
  position: fixed;
  z-index: 9999;
  width: min(360px, calc(100vw - 16px));
  height: min(80vh, calc(100dvh - 16px));
  max-height: min(80vh, calc(100dvh - 16px));
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 2px 12px var(--accent-shadow);
  overflow: hidden;
  font-family: var(--mainFontFamily, 'Noto Sans', sans-serif);
}

/* ── 标题栏（与 HTML 面板一致：渐变 header） ─── */
.ip-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px 11px;
  background: linear-gradient(90deg, var(--accent-soft), transparent 60%);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ip-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--theme-fg);
  letter-spacing: 2px;
}

.ip-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: color-mix(in srgb, var(--theme-fg) 60%, transparent);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}
.ip-icon-btn:hover {
  background: var(--hover);
  color: var(--theme-fg);
}
.ip-icon-btn:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 1px;
}

/* ── 可滚动内容 ─── */
.ip-panel-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ip-panel-content::-webkit-scrollbar {
  width: 3px;
}
.ip-panel-content::-webkit-scrollbar-track {
  background: transparent;
}
.ip-panel-content::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-fg) 20%, transparent);
  border-radius: 2px;
}

/* ── 主体 ─── */
.ip-panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── 生成按钮 ─── */
.ip-generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  color: var(--theme-fg);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.22s;
  font-family: inherit;
}
.ip-generate-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-fg) 14%, transparent);
}
.ip-generate-btn:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 2px;
}
.ip-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ip-spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--line);
  border-top-color: var(--theme-fg);
  border-radius: 50%;
  animation: ip-spin 0.7s linear infinite;
}
@keyframes ip-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 错误提示 ─── */
.ip-error {
  padding: 10px 12px;
  background: rgba(220, 80, 80, 0.1);
  border: 1px solid rgba(220, 80, 80, 0.28);
  border-radius: 8px;
  color: #e08080;
  font-size: 13px;
  line-height: 1.5;
}

/* ── 选项列表（与 HTML 面板风格一致） ─── */
.ip-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-option {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  text-align: left;
  background: var(--bg);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  padding: 11px 13px;
  cursor: pointer;
  transition:
    background 0.22s ease,
    border-color 0.22s ease,
    transform 0.22s ease;
  font-family: inherit;
}
.ip-option:hover {
  background: var(--hover);
  border-color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  transform: translateX(2px);
}
.ip-option:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 1px;
}
.ip-option:active {
  transform: translateX(1px);
}

.ip-option-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ip-fork-num {
  font-size: 11px;
  font-weight: 600;
  color: color-mix(in srgb, var(--theme-fg) 48%, transparent);
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.ip-fork-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.ip-fork-tag.tag-advance {
  background: var(--tag-advance-bg);
  color: var(--tag-advance-fg);
  border: 1px solid var(--tag-advance-border);
}
.ip-fork-tag.tag-jump {
  background: var(--tag-jump-bg);
  color: var(--tag-jump-fg);
  border: 1px solid var(--tag-jump-border);
}
.ip-fork-tag.tag-other {
  background: var(--accent-soft);
  color: color-mix(in srgb, var(--theme-fg) 70%, transparent);
  border: 1px solid var(--accent-border);
}

.ip-option-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--theme-fg);
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── API 设置与提示词编辑器 ─── */
.ip-api-section,
.ip-prompt-section {
  border-top: 1px solid var(--line);
}

.ip-api-settings {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ip-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: color-mix(in srgb, var(--theme-fg) 68%, transparent);
  font-size: 12px;
}
.ip-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 9px;
  background: color-mix(in srgb, var(--theme-fg) 4%, transparent);
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  color: var(--theme-fg);
  font: inherit;
}
.ip-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
}
.ip-secret-field {
  display: flex;
  gap: 5px;
}
.ip-secret-field .ip-input {
  flex: 1;
}
.ip-secret-toggle {
  flex-shrink: 0;
  padding: 0 8px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  color: var(--theme-fg);
  font: inherit;
  cursor: pointer;
}
.ip-api-actions {
  display: flex;
  gap: 6px;
}
.ip-api-actions .ip-btn {
  min-width: 0;
  padding-inline: 7px;
}
.ip-api-actions .ip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ip-btn-delete {
  background: rgba(220, 80, 80, 0.1);
  border-color: rgba(220, 80, 80, 0.3);
  color: #e08080;
}
.ip-btn-delete:hover {
  background: rgba(220, 80, 80, 0.18);
}
.ip-api-validation,
.ip-api-status,
.ip-api-warning,
.ip-prompt-status {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.ip-api-validation {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #e08080;
}
.ip-api-status {
  color: #7ed98c;
}
.ip-api-warning {
  color: color-mix(in srgb, #e8b66a 78%, var(--theme-fg));
}
.ip-prompt-status {
  color: #7ed98c;
}

.ip-prompt-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.2s,
    color 0.2s;
}
.ip-prompt-toggle:hover {
  background: var(--hover);
  color: var(--theme-fg);
}
.ip-prompt-toggle:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: -2px;
}

.ip-toggle-arrow {
  font-size: 9px;
  transition: transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
  display: inline-block;
}
.ip-toggle-arrow.open {
  transform: rotate(90deg);
}

.ip-prompt-editor {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ip-textarea {
  width: 100%;
  min-height: 200px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--theme-fg) 4%, transparent);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  color: var(--theme-fg);
  font-family: 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}
.ip-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
}

.ip-prompt-actions {
  display: flex;
  gap: 8px;
}

.ip-btn {
  flex: 1;
  padding: 9px 12px;
  border-radius: 7px;
  border: 1px solid;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: background 0.2s;
}
.ip-btn:focus-visible {
  outline: 2px solid var(--accent-border);
  outline-offset: 1px;
}

.ip-btn-save {
  background: rgba(100, 200, 130, 0.1);
  border-color: rgba(100, 200, 130, 0.32);
  color: #7ed98c;
}
.ip-btn-save:hover {
  background: rgba(100, 200, 130, 0.18);
}

.ip-btn-reset {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: color-mix(in srgb, var(--theme-fg) 65%, transparent);
}
.ip-btn-reset:hover {
  background: color-mix(in srgb, var(--theme-fg) 12%, transparent);
  color: var(--theme-fg);
}

/* ── 动画 ─── */
.ip-panel-fade-enter-active,
.ip-panel-fade-leave-active {
  transition:
    opacity 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.ip-panel-fade-enter-from,
.ip-panel-fade-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}

.ip-collapse-enter-active,
.ip-collapse-leave-active {
  transition: opacity 0.2s;
}
.ip-collapse-enter-from,
.ip-collapse-leave-to {
  opacity: 0;
}

/* ── 响应式 ─── */
@media (max-width: 480px) {
  .ip-panel {
    width: auto;
    max-width: calc(100vw - 16px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ip-tab,
  .ip-option,
  .ip-toggle-arrow {
    transition: none;
  }
  .ip-panel-fade-enter-active,
  .ip-panel-fade-leave-active {
    transition: none;
  }
}
</style>
