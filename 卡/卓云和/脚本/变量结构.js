import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  时间系统: z
    .object({
      日期: z.string().prefault('未知'),
      时间: z.string().prefault('未知'),
      地点: z.string().prefault('未知'),
      天气: z.string().prefault('未知'),
    })
    .prefault({}),

  卓云和个人状态: z
    .object({
      好感度: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      戒备值: z.coerce
        .number()
        .prefault(100)
        .transform(v => _.clamp(v, 0, 100)),
      爱意值: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      着装: z.string().prefault('未知'),
      姿势: z.string().prefault('未知'),
      心声: z.string().prefault('暂无'),
      今日计划: z.string().prefault('暂无'),
      坊间流言: z.string().prefault('暂无'),
      卓云和当前年龄: z.coerce.number().prefault(35),
      性爱场景中: z.string().prefault('false'),
    })
    .prefault({})
    .transform(data => {
      // 根據《数值规则》，愛意值解鎖條件為：好感度 >= 50 且 戒备值 <= 40
      const $爱意值已解锁 = data.好感度 >= 50 && data.戒备值 <= 40;
      // 防備 >= 60 時，好感上限被限制在 50
      if (data.戒备值 >= 60 && data.好感度 > 50) {
        data.好感度 = 50;
      }
      return { ...data, $爱意值已解锁 };
    }),
});

$(() => {
  registerMvuSchema(Schema);
});
