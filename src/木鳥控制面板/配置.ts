/**
 * 加载并校验 `面板配置.yaml`, 把「维度 + 开启」展开成面板直接可用的条目状态表.
 *
 * 面板界面只消费这个文件导出的结果, 不再持有任何硬编码的条目名.
 */
import { Schema } from './schema';
import raw_config from './面板配置.yaml';

/** 条目名 -> 是否启用 */
export type StateMap = Record<string, boolean>;

export interface ScenePlan {
  name: string;
  desc: string;
  warning?: string;
  states: StateMap;
}

export interface ConfigOption {
  value: string;
  label: string;
  states: StateMap;
}

export interface ConfigField {
  key: string;
  label: string;
  multi: boolean;
  default: string | string[];
  options: ConfigOption[];
}

export interface SubgroupDef {
  parent: string;
  name: string;
  names: string[];
}

export interface GroupDef {
  name: string;
  /** 标记包裹: 首尾是仅用于分隔的标记条目; 范围: 首尾本身是普通条目 */
  kind: '标记包裹' | '范围';
  start: string;
  end: string;
  locked: boolean;
}

export interface PanelConfig {
  scenePlans: ScenePlan[];
  configFields: ConfigField[];
  groupDefs: GroupDef[];
  subgroupDefs: SubgroupDef[];
  lockedItems: string[];
  /** 配置里提到的所有条目名, 用于启动时校验预设中是否真的存在 */
  referencedNames: string[];
}

function parseConfig(): z.output<typeof Schema> {
  const result = Schema.safeParse(raw_config);
  if (!result.success) {
    throw Error(`面板配置.yaml 格式错误:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const config = parseConfig();

/** 把一个维度的选择写法展开为「该维度全部条目」的开关状态 */
function expandDimension(dimension: string, 选择: unknown): StateMap {
  const all = config.维度[dimension];
  if (all === undefined) {
    throw Error(`面板配置.yaml 引用了未定义的维度「${dimension}」`);
  }

  const on = (() => {
    if (选择 === '全部') {
      return all;
    }
    if (选择 === '无') {
      return [];
    }
    if (typeof 选择 === 'string') {
      return [选择];
    }
    if (Array.isArray(选择)) {
      return 选择 as string[];
    }
    const 除外 = (选择 as { 除外: string[] }).除外;
    return all.filter(name => !除外.includes(name));
  })();

  const unknown_names = on.filter(name => !all.includes(name));
  if (unknown_names.length > 0) {
    console.warn(`[预设控制面板] 维度「${dimension}」里没有这些条目: ${unknown_names.join(', ')}`);
  }

  return Object.fromEntries(all.map(name => [name, on.includes(name)]));
}

/** 把 `开启` + `额外` 合并成完整的条目状态表 */
function expandStates(定义: { 开启: Record<string, unknown>; 额外: Record<string, boolean> }): StateMap {
  const states: StateMap = {};
  for (const [dimension, 选择] of Object.entries(定义.开启)) {
    Object.assign(states, expandDimension(dimension, 选择));
  }
  // 额外写在后面, 允许覆盖维度展开的结果
  Object.assign(states, 定义.额外);
  return states;
}

const scenePlans: ScenePlan[] = config.场景方案.map(plan => ({
  name: plan.名称,
  desc: plan.说明,
  warning: plan.警告,
  states: expandStates(plan),
}));

const configFields: ConfigField[] = config.常驻配置.map(field => {
  const options = field.选项.map(option => ({
    value: option.值,
    label: option.标签,
    states: expandStates(option),
  }));
  const fallback = options[0].value;
  if (field.多选) {
    const defaults = Array.isArray(field.默认)
      ? (field.默认 as string[]).filter(v => options.some(o => o.value === v))
      : field.默认 && options.some(o => o.value === field.默认)
        ? [field.默认 as string]
        : [fallback];
    return { key: field.键, label: field.标签, multi: true, default: defaults, options };
  }
  const defaultStr = typeof field.默认 === 'string' ? field.默认 : undefined;
  if (defaultStr !== undefined && !options.some(o => o.value === defaultStr)) {
    console.warn(`[预设控制面板] 常驻配置「${field.标签}」的默认值 ${defaultStr} 不在选项里, 已改用 ${fallback}`);
  }
  return {
    key: field.键,
    label: field.标签,
    multi: false,
    default: options.some(o => o.value === defaultStr) ? (defaultStr as string) : fallback,
    options,
  };
});

const groupDefs: GroupDef[] = config.分组.map(group => ({
  name: group.名称,
  kind: group.类型,
  start: group.起始,
  end: group.结束,
  locked: group.锁定,
}));

const subgroupDefs: SubgroupDef[] = config.分组.flatMap(group =>
  group.子分类.map(sub => ({ parent: group.名称, name: sub.名称, names: sub.条目 })),
);

const referencedNames = [
  ...Object.values(config.维度).flat(),
  ...config.分组.flatMap(group => [group.起始, group.结束, ...group.子分类.flatMap(sub => sub.条目)]),
  ...config.常驻配置.flatMap(field => field.选项.flatMap(option => Object.keys(option.额外))),
  ...config.场景方案.flatMap(plan => Object.keys(plan.额外)),
  ...config.锁定条目,
];

export const panelConfig: PanelConfig = {
  scenePlans,
  configFields,
  groupDefs,
  subgroupDefs,
  lockedItems: config.锁定条目,
  referencedNames: [...new Set(referencedNames)],
};

/** 常驻配置的默认选择 */
export const defaultConfigValues: Record<string, string | string[]> = Object.fromEntries(
  configFields.map(field => [field.key, field.default]),
);
