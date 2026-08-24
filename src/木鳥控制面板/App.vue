<template>
  <div class="preset-panel-overlay" :style="overlayStyle" @click.self="close">
    <div class="preset-panel">
      <div class="panel-header">
        <h2>预设控制面板</h2>
        <button class="close-btn" @click="close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="panel-body">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <template v-else>
          <div v-if="missingNames.length > 0" class="warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            面板配置.yaml 里有 {{ missingNames.length }} 个条目名在当前预设中找不到, 详见浏览器控制台。
          </div>

          <div class="quick-tabs">
            <button :class="['quick-tab', { active: quickTab === 'scene' }]" @click="switchTab('scene')">
              <i class="fa-solid fa-clapperboard"></i>
              场景方案
            </button>
            <button :class="['quick-tab', { active: quickTab === 'config' }]" @click="switchTab('config')">
              <i class="fa-solid fa-sliders"></i>
              常驻配置
            </button>
            <button :class="['quick-tab', { active: quickTab === 'items' }]" @click="switchTab('items')">
              <i class="fa-solid fa-list-check"></i>
              条目总览
            </button>
          </div>

          <div v-if="quickTab !== 'items'" class="quick-panel">
            <template v-if="quickTab === 'scene'">
              <div class="chip-list">
                <button
                  v-for="plan in SCENE_PLANS"
                  :key="plan.name"
                  :class="['chip', { active: selectedScene === plan.name }]"
                  @click="applyScene(plan)"
                >
                  {{ plan.name }}
                </button>
              </div>
              <div v-if="activePlan" class="hint">{{ activePlan.desc }}</div>
              <div v-if="activePlan?.warning" class="warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                {{ activePlan.warning }}
              </div>
              <div class="hint">场景只调整文风、世界法则、慾望界線、亲密模块与节奏，不会改动常驻配置。</div>
            </template>
            <template v-else>
              <div class="config-grid">
                <div
                  v-for="field in CONFIG_FIELDS"
                  :key="field.key"
                  :class="['config-row', { 'config-row--multi': field.multi }]"
                >
                  <span class="config-label">{{ field.label }}</span>
                  <template v-if="field.multi">
                    <div class="config-checks">
                      <label v-for="opt in field.options" :key="opt.value" class="config-check">
                        <input
                          type="checkbox"
                          :value="opt.value"
                          :checked="(config[field.key] as string[]).includes(opt.value)"
                          @change="toggleMulti(field.key, opt.value, ($event.target as HTMLInputElement).checked)"
                        />
                        <span class="config-check-label">{{ opt.label }}</span>
                      </label>
                    </div>
                  </template>
                  <select v-else v-model="config[field.key]" class="config-select" @change="applyConfig">
                    <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary apply-config-btn" @click="applyConfig">套用常驻配置</button>
              <div class="hint">常驻配置不会被场景切换改动，套用后仍需点「保存并应用」写入预设。</div>
            </template>
          </div>

          <div v-show="quickTab === 'items'" class="group-list">
            <div v-if="ungroupedCount > 0" class="hint ungrouped-hint">
              有 {{ ungroupedCount }} 个条目不属于任何分组, 它们在下方「未分组」里。若想归类, 在 面板配置.yaml
              的「分组」中调整起止条目。
            </div>
            <div v-for="(group, gIdx) in groups" :key="gIdx" class="group-section">
              <div class="group-header" @click="toggleGroup(gIdx)">
                <i :class="group.collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
                <span class="group-name">{{ group.name }}</span>
                <span class="group-count">{{ countItems(group) }} 条</span>
              </div>
              <div v-show="!group.collapsed" class="group-items">
                <template v-for="(node, nIdx) in group.nodes" :key="nIdx">
                  <div v-if="node.kind === 'subgroup'" class="subgroup-section">
                    <div class="subgroup-header" @click="toggleSubgroup(node)">
                      <i :class="node.collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"></i>
                      <span class="subgroup-name">{{ node.name }}</span>
                      <span class="group-count">{{ node.items.length }} 条</span>
                    </div>
                    <div v-show="!node.collapsed" class="subgroup-items">
                      <div
                        v-for="(item, iIdx) in node.items"
                        :key="iIdx"
                        :class="['prompt-item', { 'is-locked': item.locked }]"
                      >
                        <label class="switch">
                          <input v-model="item.enabled" type="checkbox" :disabled="item.locked" @change="saveState" />
                          <span class="slider"></span>
                        </label>
                        <span class="item-name" :title="item.name">{{ item.name }}</span>
                        <span class="item-role">{{ item.role }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-else :class="['prompt-item', { 'is-marker': node.isMarker, 'is-locked': node.locked }]">
                    <label class="switch">
                      <input v-model="node.enabled" type="checkbox" :disabled="node.locked" @change="saveState" />
                      <span class="slider"></span>
                    </label>
                    <span class="item-name" :title="node.name">{{ node.name }}</span>
                    <span class="item-role">{{ node.role }}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="panel-footer">
        <button class="btn btn-primary" @click="saveAndApply">保存并应用</button>
        <button class="btn btn-secondary" @click="refresh">放棄並重載</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { defaultConfigValues, panelConfig, type ScenePlan, type StateMap } from './配置';

const props = defineProps<{
  onClose: () => void;
}>();

const script_id = getScriptId();

/** 面板结构与场景方案全部来自 面板配置.yaml, 见同目录下该文件顶部的说明 */
const { scenePlans: SCENE_PLANS, configFields: CONFIG_FIELDS, groupDefs, subgroupDefs, lockedItems } = panelConfig;

interface PromptItem {
  kind: 'item';
  id: string;
  name: string;
  enabled: boolean;
  role: string;
  isMarker: boolean;
  /** 锁定的条目不允许在面板里开关 */
  locked: boolean;
}

interface SubGroup {
  kind: 'subgroup';
  name: string;
  collapsed: boolean;
  items: PromptItem[];
}

type GroupNode = PromptItem | SubGroup;

interface Group {
  name: string;
  collapsed: boolean;
  nodes: GroupNode[];
}

const groups = ref<Group[]>([]);
const loading = ref(true);
const error = ref('');
/** 配置里写了但预设中找不到的条目名, 用于提示配置写错 */
const missingNames = ref<string[]>([]);

/**
 * 移动端 100vh 常常大于真实可视区 (地址栏、工具栏、键盘都会占位),
 * 用 visualViewport 实测高度并以行内样式写入, 保证面板永远落在可见范围内。
 */
const viewportHeight = ref(0);
const viewportOffsetTop = ref(0);

const overlayStyle = computed(() => {
  if (viewportHeight.value <= 0) {
    return undefined;
  }
  return {
    height: `${viewportHeight.value}px`,
    transform: viewportOffsetTop.value > 0 ? `translateY(${viewportOffsetTop.value}px)` : undefined,
  };
});

function syncViewport(): void {
  const vv = window.visualViewport;
  viewportHeight.value = vv ? vv.height : window.innerHeight;
  viewportOffsetTop.value = vv ? vv.offsetTop : 0;
}

const quickTab = ref<'scene' | 'config' | 'items'>('scene');
const selectedScene = ref('');
const config = ref<Record<string, string | string[]>>({ ...defaultConfigValues });

const activePlan = computed(() => SCENE_PLANS.find((p: ScenePlan) => p.name === selectedScene.value));

/** 未被任何分组收录的条目数, 提示有新条目待归类 */
const ungroupedCount = computed(() => {
  const group = groups.value.find(g => g.name === '未分组');
  return group ? countItems(group) : 0;
});

/** 展开分组内所有条目 (含子分组), 保持显示顺序 */
function flattenGroup(group: Group): PromptItem[] {
  return group.nodes.flatMap(node => (node.kind === 'subgroup' ? node.items : [node]));
}

function countItems(group: Group): number {
  return flattenGroup(group).filter(i => !i.isMarker).length;
}

/** 锁定分组内全部条目, 使其开关不可操作 */
function applyLock(group: Group): void {
  const lockAll = groupDefs.some(def => def.name === group.name && def.locked);
  flattenGroup(group).forEach(item => {
    if (lockAll || lockedItems.includes(item.name)) {
      item.locked = true;
    }
  });
}

/** 把分组内命中小分类的条目收进子分组, 子分组占据其首个条目原本的位置 */
function buildSubgroups(group: Group): void {
  const defs = subgroupDefs.filter(d => d.parent === group.name);
  if (defs.length === 0) {
    return;
  }

  const nodes: GroupNode[] = [];
  const created = new Map<string, SubGroup>();

  for (const node of group.nodes) {
    if (node.kind === 'subgroup') {
      nodes.push(node);
      continue;
    }

    const def = defs.find(d => d.names.includes(node.name));
    if (!def) {
      nodes.push(node);
      continue;
    }

    let sub = created.get(def.name);
    if (!sub) {
      sub = { kind: 'subgroup', name: def.name, collapsed: true, items: [] };
      created.set(def.name, sub);
      nodes.push(sub);
    }
    sub.items.push(node);
  }

  group.nodes = nodes;
}

function parsePresetToGroups(preset: Preset): Group[] {
  const prompts = preset.prompts;
  const result: Group[] = [];
  let currentGroup: Group | null = null;
  /** 当前范围分组的结束条目名, 该条目本身是普通可开关条目 */
  let currentRangeEnd: string | null = null;
  /** 当前标记包裹分组的结束标记名, 该标记以灰色斜体显示 */
  let currentMarkerEnd: string | null = null;
  let ungrouped: Group = { name: '未分组', collapsed: true, nodes: [] };

  const flushUngrouped = () => {
    if (ungrouped.nodes.length > 0) {
      applyLock(ungrouped);
      result.push(ungrouped);
      ungrouped = { name: '未分组', collapsed: true, nodes: [] };
    }
  };

  const closeGroup = () => {
    if (currentGroup) {
      buildSubgroups(currentGroup);
      applyLock(currentGroup);
      result.push(currentGroup);
    }
    currentGroup = null;
    currentRangeEnd = null;
    currentMarkerEnd = null;
  };

  for (const p of prompts) {
    const name = p.name || p.id || '';
    const item = (isMarker: boolean): PromptItem => ({
      kind: 'item',
      id: p.id,
      name,
      enabled: p.enabled,
      role: p.role,
      isMarker,
      locked: false,
    });

    // 标记包裹的分组: 结束标记 (标记本身以灰色斜体显示)
    if (currentGroup && currentMarkerEnd !== null && currentMarkerEnd === name) {
      currentGroup.nodes.push(item(true));
      closeGroup();
      continue;
    }

    // 范围分组: 结束条目 (边界也是普通可开关条目)
    if (currentGroup && currentRangeEnd !== null && currentRangeEnd === name) {
      currentGroup.nodes.push(item(false));
      closeGroup();
      continue;
    }

    // 任意分组的开始条目
    const startDef = groupDefs.find(g => g.start === name);
    if (startDef && !currentGroup) {
      const isMarker = startDef.kind === '标记包裹';
      flushUngrouped();
      currentGroup = { name: startDef.name, collapsed: true, nodes: [item(isMarker)] };
      // 单条目分组: 首尾同名时立即闭合
      if (startDef.start === startDef.end) {
        closeGroup();
      } else if (isMarker) {
        currentMarkerEnd = startDef.end;
      } else {
        currentRangeEnd = startDef.end;
      }
      continue;
    }

    if (currentGroup) {
      currentGroup.nodes.push(item(false));
    } else {
      ungrouped.nodes.push(item(false));
    }
  }

  // 范围结束条目缺失时, 不丢弃已收集的条目
  closeGroup();
  flushUngrouped();

  return result;
}

function applyGroupsToPreset(preset: Preset, groupList: Group[]): Preset {
  const newPrompts: PresetPrompt[] = [];
  const allItems = groupList.flatMap(g => flattenGroup(g));
  const groupedIds = new Set(allItems.map(i => i.id));

  for (const item of allItems) {
    const original = preset.prompts.find(p => p.id === item.id);
    if (original) {
      newPrompts.push({ ...original, enabled: item.enabled });
    }
  }

  for (const p of preset.prompts) {
    if (!groupedIds.has(p.id)) {
      newPrompts.push(p);
    }
  }

  return { ...preset, prompts: newPrompts };
}

/** 折叠状态键: 分组用组名, 子分组用「组名/子组名」 */
function collectCollapsedState(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  groups.value.forEach(g => {
    map[g.name] = g.collapsed;
    g.nodes.forEach(node => {
      if (node.kind === 'subgroup') {
        map[`${g.name}/${node.name}`] = node.collapsed;
      }
    });
  });
  return map;
}

function restoreCollapsedState(map: Record<string, boolean>) {
  groups.value.forEach(g => {
    if (map[g.name] !== undefined) {
      g.collapsed = map[g.name];
    }
    g.nodes.forEach(node => {
      if (node.kind === 'subgroup') {
        const key = `${g.name}/${node.name}`;
        if (map[key] !== undefined) {
          node.collapsed = map[key];
        }
      }
    });
  });
}

/**
 * 统一条目名格式，避免不可见空白、全角字符等差异造成方案静默匹配失败。
 * 配置诊断与状态套用使用同一规则。
 */
function normalizePromptName(name: string): string {
  return name.normalize('NFKC').trim();
}

/**
 * 按条目名批量写入启用状态，锁定条目会被跳过。
 * 通过替换 groups 的完整引用确保 Vue 立即刷新“条目总览”。
 *
 * @returns 实际命中的可修改条目数量
 */
function applyStates(states: StateMap): number {
  const normalizedStates = new Map(
    Object.entries(states).map(([name, enabled]) => [normalizePromptName(name), enabled]),
  );
  let matched = 0;

  const updateItem = (item: PromptItem): PromptItem => {
    const target = normalizedStates.get(normalizePromptName(item.name));
    if (target === undefined || item.locked) {
      return item;
    }
    matched += 1;
    return { ...item, enabled: target };
  };

  groups.value = groups.value.map(group => ({
    ...group,
    nodes: group.nodes.map(node =>
      node.kind === 'subgroup' ? { ...node, items: node.items.map(updateItem) } : updateItem(node),
    ),
  }));

  return matched;
}

function applyScene(plan: ScenePlan): void {
  const matched = applyStates(plan.states);
  selectedScene.value = plan.name;
  persist();
  if (matched === 0) {
    toastr.warning(`场景「${plan.name}」没有匹配到任何预设条目，请检查条目名称`);
    return;
  }
  toastr.info(`已套用场景「${plan.name}」并更新 ${matched} 个条目，记得点保存并应用`);
}

function applyConfig(): void {
  let matched = 0;
  for (const field of CONFIG_FIELDS) {
    if (field.multi) {
      const selected = config.value[field.key] as string[];
      // 先关闭该维度所有选项，再开启被选中的
      const allStates: StateMap = {};
      for (const opt of field.options) {
        for (const k of Object.keys(opt.states)) {
          allStates[k] = false;
        }
      }
      for (const opt of field.options) {
        if (selected.includes(opt.value)) {
          for (const [k, v] of Object.entries(opt.states)) {
            if (v) allStates[k] = true;
          }
        }
      }
      matched += applyStates(allStates);
    } else {
      const option = field.options.find(o => o.value === config.value[field.key]);
      if (option) {
        matched += applyStates(option.states);
      }
    }
  }
  persist();
  if (matched === 0) {
    toastr.warning('常驻配置没有匹配到任何预设条目，请检查条目名称');
    return;
  }
  toastr.info(`已套用常驻配置并更新 ${matched} 个条目，记得点保存并应用`);
}

function toggleMulti(key: string, value: string, checked: boolean): void {
  const arr = [...(config.value[key] as string[])];
  if (checked) {
    if (!arr.includes(value)) arr.push(value);
  } else {
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
  }
  config.value[key] = arr;
  applyConfig();
}

function switchTab(tab: 'scene' | 'config' | 'items'): void {
  quickTab.value = tab;
  persist();
}

function persist(): void {
  replaceVariables(
    {
      collapsedState: collectCollapsedState(),
      selectedScene: selectedScene.value,
      config: { ...config.value },
      quickTab: quickTab.value,
    },
    { type: 'script', script_id },
  );
}

/** 校验配置里引用的条目名在预设中是否真的存在, 帮助定位 面板配置.yaml 的笔误 */
function diagnose(preset: Preset): void {
  const existing = new Set(preset.prompts.map(p => normalizePromptName(p.name || p.id || '')));
  missingNames.value = panelConfig.referencedNames.filter(name => !existing.has(normalizePromptName(name)));
  if (missingNames.value.length > 0) {
    console.warn(`[预设控制面板] 面板配置.yaml 里这些条目名在预设中不存在:\n${missingNames.value.join('\n')}`);
  }
}

async function loadPreset() {
  loading.value = true;
  error.value = '';
  try {
    const preset = getPreset('in_use');
    groups.value = parsePresetToGroups(preset);
    diagnose(preset);
    // 从脚本变量恢复折叠状态与常驻配置
    const saved = getVariables({ type: 'script', script_id });
    if (saved.collapsedState) {
      restoreCollapsedState(saved.collapsedState as Record<string, boolean>);
    }
    if (saved.config) {
      config.value = { ...defaultConfigValues, ...(saved.config as Record<string, string | string[]>) };
    }
    if (typeof saved.selectedScene === 'string') {
      selectedScene.value = saved.selectedScene;
    }
    if (saved.quickTab === 'scene' || saved.quickTab === 'config' || saved.quickTab === 'items') {
      quickTab.value = saved.quickTab;
    }
  } catch (e) {
    error.value = `加载预设失败: ${e}`;
    console.error('[预设控制面板]', e);
  } finally {
    loading.value = false;
  }
}

async function saveAndApply() {
  try {
    const preset = getPreset('in_use');
    const newPreset = applyGroupsToPreset(preset, groups.value);
    await replacePreset('in_use', newPreset, { render: 'immediate' });
    persist();
    document.querySelector<HTMLElement>('#save_preset')?.click();
    toastr.success('预设已更新');
  } catch (e) {
    toastr.error(`保存失败: ${e}`);
    console.error('[预设控制面板]', e);
  }
}

function toggleGroup(index: number) {
  groups.value[index].collapsed = !groups.value[index].collapsed;
}

function toggleSubgroup(sub: SubGroup) {
  sub.collapsed = !sub.collapsed;
}

function saveState() {
  // 手动改开关后不再属于任何完整场景
  selectedScene.value = '';
  persist();
}

function refresh() {
  loadPreset();
}

function close() {
  props.onClose();
}

onMounted(() => {
  loadPreset();
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', syncViewport);
  window.visualViewport?.removeEventListener('scroll', syncViewport);
  window.removeEventListener('resize', syncViewport);
  window.removeEventListener('orientationchange', syncViewport);
});
</script>

<style lang="scss" scoped>
.preset-panel-overlay {
  /* 强调色跟随酒馆正文色: 亮主题为深色, 暗主题为浅色, 任何主题下都保证可读 */
  --theme-fg: var(--SmartThemeBodyColor, #888888);
  --accent: var(--theme-fg);
  --accent-strong: color-mix(in srgb, var(--theme-fg) 80%, transparent);
  --accent-soft: color-mix(in srgb, var(--theme-fg) 10%, transparent);
  --accent-border: color-mix(in srgb, var(--theme-fg) 35%, transparent);
  --accent-shadow: color-mix(in srgb, var(--theme-fg) 20%, transparent);
  /* 选中态用正文色低透明度填充, 文字始终保持正文色, 亮暗主题都不会糊成一片 */
  --accent-fill: color-mix(in srgb, var(--theme-fg) 16%, transparent);
  --accent-fill-strong: color-mix(in srgb, var(--theme-fg) 26%, transparent);
  /* 开关圆点取面板底色, 在填满的轨道上形成镂空效果 */
  --accent-on: var(--SmartThemeBlurTintColor, #1e1e1e);
  --bg-card: color-mix(in srgb, var(--theme-fg) 4%, transparent);
  --hover: color-mix(in srgb, var(--theme-fg) 8%, transparent);
  --line: color-mix(in srgb, var(--theme-fg) 16%, transparent);

  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  /* 移动端浏览器地址栏会改变可视高度: dvh 跟随实际可视区, 不支持时退回 100% */
  height: 100%;
  height: 100dvh;
  box-sizing: border-box;
  /* 预留刘海屏安全区, 保证标题栏和底部按钮始终可点 */
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
    max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  /* 用 flex-start + 子元素 margin:auto 居中: 内容超高时不会像 align-items:center 那样把顶部裁掉 */
  align-items: flex-start;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 9999;
}

.preset-panel {
  background: var(--SmartThemeBlurTintColor, #1e1e1e);
  border: 1px solid var(--SmartThemeBorderColor, #454545);
  border-radius: 16px;
  box-sizing: border-box;
  width: 100%;
  max-width: 620px;
  /* 上限为遮罩可视高度, 超出部分交给 .panel-body 内部滚动, 面板不会溢出屏幕 */
  max-height: 100%;
  margin: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--SmartThemeBorderColor, #454545);
  background: linear-gradient(90deg, var(--accent-soft), transparent 60%);

  h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 1px;
    color: var(--SmartThemeBodyColor, #fff);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--SmartThemeBodyColor, #fff);
    font-size: 18px;
    cursor: pointer;
    opacity: 0.6;
    transition:
      opacity 0.2s,
      transform 0.2s;

    &:hover {
      opacity: 1;
      transform: rotate(90deg);
    }
  }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  color: var(--SmartThemeBodyColor, #fff);
}

.error {
  color: #e8836f;
}

/* ── 顶部快捷区 ───────────────────────────── */
.quick-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--SmartThemeBorderColor, #454545);
}

.quick-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  white-space: nowrap;
  background: transparent;
  color: var(--SmartThemeBodyColor, #fff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.65;
  transition:
    background 0.2s,
    opacity 0.2s,
    color 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &.active {
    background: var(--accent-fill);
    color: var(--SmartThemeBodyColor, #fff);
    opacity: 1;
    font-weight: 700;
    box-shadow:
      inset 0 0 0 1px var(--accent-border),
      0 1px 6px var(--accent-shadow);
  }
}

.quick-panel {
  margin-bottom: 16px;
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed var(--accent-border);
  background: var(--accent-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 场景按钮网格 */
.chip-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.chip {
  padding: 10px 6px;
  border: 1px solid var(--SmartThemeBorderColor, #4f4f4f);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--SmartThemeBodyColor, #fff);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.15s;

  &:hover {
    background: var(--hover);
    transform: translateY(-1px);
  }

  &.active {
    background: var(--accent-fill-strong);
    border-color: var(--accent-border);
    color: var(--SmartThemeBodyColor, #fff);
    font-weight: 600;
    box-shadow: 0 1px 6px var(--accent-shadow);
  }
}

.hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--SmartThemeBodyColor, #fff);
  opacity: 0.55;
}

.ungrouped-hint {
  margin-bottom: 8px;
}

.warning {
  font-size: 12px;
  line-height: 1.6;
  color: #f0b67f;
  background: rgba(240, 182, 127, 0.12);
  border: 1px solid rgba(240, 182, 127, 0.35);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}

.config-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.config-label {
  font-size: 12px;
  color: var(--SmartThemeBodyColor, #fff);
  opacity: 0.65;
}

.config-select {
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--SmartThemeBorderColor, #4f4f4f);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--SmartThemeBodyColor, #fff);
  font-size: 13px;
  outline: none;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--accent);
  }
}

.config-row--multi {
  grid-column: 1 / -1;
}

.config-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.config-check {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--SmartThemeBorderColor, #4f4f4f);
  border-radius: 8px;
  background: var(--accent-soft);
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;

  &:hover {
    background: var(--hover);
  }

  &:has(input:checked) {
    background: var(--accent-fill);
    border-color: var(--accent-border);
  }

  input[type='checkbox'] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
  }
}

.config-check-label {
  font-size: 12px;
  color: var(--SmartThemeBodyColor, #fff);
  white-space: nowrap;
}

.apply-config-btn {
  align-self: flex-end;
}

/* ── 分组 ───────────────────────────── */
.group-section {
  margin-bottom: 10px;
  border: 1px solid var(--SmartThemeBorderColor, #454545);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  border-left: 3px solid var(--accent);
  transition: background 0.2s;

  &:hover {
    background: var(--hover);
  }

  i {
    font-size: 11px;
    color: var(--accent);
    opacity: 0.9;
  }

  .group-name {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    color: var(--SmartThemeBodyColor, #fff);
  }

  .group-count {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-fill);
    color: var(--SmartThemeBodyColor, #fff);
    opacity: 0.7;
  }
}

.group-items {
  padding: 6px 10px 8px;
}

.subgroup-section {
  margin: 4px 0;
  border: 1px solid var(--SmartThemeBorderColor, #454545);
  border-radius: 8px;
  overflow: hidden;
}

.subgroup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-card);
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--hover);
  }

  i {
    font-size: 9px;
    color: var(--SmartThemeBodyColor, #fff);
    opacity: 0.5;
  }

  .subgroup-name {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--SmartThemeBodyColor, #fff);
    opacity: 0.85;
  }
}

.subgroup-items {
  padding: 4px 4px 4px 16px;
}

.prompt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  margin-bottom: 2px;

  &:hover {
    background: var(--hover);
  }

  &.is-marker {
    opacity: 0.55;
    font-style: italic;

    .item-name {
      color: var(--accent);
    }
  }

  &.is-locked {
    .switch {
      cursor: not-allowed;
      opacity: 0.4;

      .slider {
        cursor: not-allowed;
      }
    }

    .item-name {
      opacity: 0.7;
    }
  }
}

.item-name {
  flex: 1;
  color: var(--SmartThemeBodyColor, #fff);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-role {
  font-size: 10px;
  color: var(--SmartThemeBodyColor, #fff);
  opacity: 0.35;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Switch 开关 */
.switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .slider {
      background-color: var(--accent);
    }

    &:checked + .slider:before {
      transform: translateX(16px);
      background-color: var(--accent-on);
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--accent-fill);
    transition: 0.2s;
    border-radius: 22px;

    &:before {
      position: absolute;
      content: '';
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
      transition: 0.2s;
      border-radius: 50%;
    }
  }
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--SmartThemeBorderColor, #454545);
}

.btn {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition:
    background 0.2s,
    transform 0.15s;

  &:hover {
    transform: translateY(-1px);
  }

  &.btn-primary {
    background: var(--accent-fill-strong);
    color: var(--SmartThemeBodyColor, #fff);
    border: 1px solid var(--accent-border);
    box-shadow: 0 2px 10px var(--accent-shadow);

    &:hover {
      background: color-mix(in srgb, var(--theme-fg) 36%, transparent);
    }
  }

  &.btn-secondary {
    background: transparent;
    color: var(--SmartThemeBodyColor, #fff);
    border: 1px solid var(--SmartThemeBorderColor, #4f4f4f);

    &:hover {
      background: var(--hover);
    }
  }
}

/* ── 移动端适配 ───────────────────────────── */
@media (max-width: 768px) {
  .preset-panel {
    border-radius: 12px;
  }

  .panel-header {
    padding: 12px 14px;

    h2 {
      font-size: 15px;
    }
  }

  .panel-body {
    padding: 12px 12px;
  }

  .quick-tab {
    padding: 10px 4px;
    font-size: 12px;
    gap: 4px;
  }

  .quick-panel {
    padding: 12px 10px;
  }

  /* 窄屏下三列会把场景名挤成竖排, 改两列 */
  .chip-list {
    grid-template-columns: repeat(2, 1fr);
  }

  /* 下拉框单列排布, 避免选项文字被截断 */
  .config-grid {
    grid-template-columns: 1fr;
  }

  .apply-config-btn {
    align-self: stretch;
  }

  .group-header {
    padding: 10px 10px;
  }

  .group-items {
    padding: 6px 6px 8px;
  }

  .subgroup-items {
    padding: 4px 2px 4px 10px;
  }

  .prompt-item {
    gap: 8px;
    padding: 8px 6px;
  }

  /* 触摸目标保持够大, 同时给条目名留出宽度 */
  .switch {
    width: 42px;
    height: 24px;

    input:checked + .slider:before {
      transform: translateX(18px);
    }

    .slider:before {
      height: 18px;
      width: 18px;
    }
  }

  .item-role {
    display: none;
  }

  .panel-footer {
    padding: 12px 12px;
    gap: 8px;
  }

  /* 底部按钮平分宽度, 单手也能点到 */
  .btn {
    flex: 1;
    padding: 11px 10px;
  }
}
</style>
