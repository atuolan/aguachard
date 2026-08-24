/**
 * 预设控制面板的配置结构定义.
 *
 * 这个文件只描述 `面板配置.yaml` 的格式, 不含任何逻辑.
 * 运行 `pnpm dump` 会生成同目录下的 `schema.json`, 供 `面板配置.yaml` 顶部的
 * `# yaml-language-server: $schema=./schema.json` 提供编辑器补全与校验.
 */

/** 一个维度内要开启哪些条目, 未被选中的同维度条目会被自动关闭 */
const 维度选择 = z.union([
  z.literal('全部').describe('本维度所有条目都开启'),
  z.literal('无').describe('本维度所有条目都关闭'),
  z.array(z.string().describe('条目名')).describe('只开启列出的条目, 其余关闭'),
  z
    .object({ 除外: z.array(z.string().describe('条目名')).describe('要关闭的条目') })
    .describe('除列出的条目外全部开启'),
  z.string().describe('只开启这一个条目, 同维度其余关闭'),
]);

/** 按维度描述一套条目开关状态 */
const 状态定义 = {
  开启: z
    .record(z.string().describe('维度名'), 维度选择)
    .default({})
    .describe('按维度声明要开启的条目; 没有写到的维度完全不受影响'),
  额外: z.record(z.string().describe('条目名'), z.boolean()).default({}).describe('不属于任何维度的单个条目开关'),
};

const 场景方案 = z.object({
  名称: z.string().describe('显示在场景按钮上的名字'),
  说明: z.string().default('').describe('选中场景后显示的说明文字'),
  警告: z.string().optional().describe('需要提醒用户的副作用, 会以醒目样式显示'),
  ...状态定义,
});

const 常驻配置项 = z.object({
  键: z.string().describe('内部标识, 用于记住用户的选择, 不可与其他配置项重复'),
  标签: z.string().describe('显示在下拉框上方的名字'),
  多选: z.boolean().default(false).describe('允许同时选中多个选项; 为 true 时以复选框组呈现'),
  默认: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('默认选中的选项值; 多选时为数组, 单选时为字符串; 不填则用第一个选项'),
  选项: z
    .array(
      z.object({
        值: z.string().describe('内部标识, 同一配置项内不可重复'),
        标签: z.string().describe('显示在下拉框里的名字'),
        ...状态定义,
      }),
    )
    .min(1)
    .describe('可选项列表'),
});

const 子分类 = z.object({
  名称: z.string().describe('显示在子分类标题上的名字'),
  条目: z.array(z.string().describe('条目名')).min(1).describe('要收进这个子分类的条目'),
});

const 分组 = z.object({
  名称: z.string().describe('显示在分组标题上的名字'),
  类型: z
    .enum(['标记包裹', '范围'])
    .describe('标记包裹: 首尾是仅用于分隔的标记条目, 会以灰色斜体显示; 范围: 首尾本身就是可开关的普通条目'),
  起始: z.string().describe('分组第一个条目的名称'),
  结束: z.string().describe('分组最后一个条目的名称; 与起始同名表示这个分组只有一个条目'),
  锁定: z.boolean().default(false).describe('整组条目都不允许在面板里开关'),
  子分类: z.array(子分类).default([]).describe('把组内部分条目再收成可折叠的小分类'),
});

export const Schema = z.object({
  维度: z
    .record(z.string().describe('维度名'), z.array(z.string().describe('条目名')))
    .default({})
    .describe('把一组相关条目命名为一个维度, 供场景方案与常驻配置引用'),
  场景方案: z.array(场景方案).default([]).describe('一键切换的整套条目开关'),
  常驻配置: z.array(常驻配置项).default([]).describe('不受场景切换影响的下拉配置'),
  分组: z.array(分组).default([]).describe('条目总览里的分组结构'),
  锁定条目: z.array(z.string().describe('条目名')).default([]).describe('不允许在面板里开关的单个条目'),
});
export type Schema = z.output<typeof Schema>;
