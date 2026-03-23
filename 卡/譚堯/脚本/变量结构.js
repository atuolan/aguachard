import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  谭尧: z
    .object({
      好感度: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      恶感度: z.coerce
        .number()
        .prefault(60)
        .transform(v => _.clamp(v, 0, 100)),
      警惕值: z.coerce
        .number()
        .prefault(100)
        .transform(v => _.clamp(v, 0, 100)),
      亲密度: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      时间: z.string().prefault('4/22 - 周三 - 上午 - 10:22 - 阴雨'),
      心情: z.string().prefault('烦躁、漠然'),
      想法: z.string().prefault('暂无'),
      约定与代办事项: z.string().prefault('暂无'),
      性行为进行中: z.boolean().prefault(false),
      小雅嫉妒事件已触发: z.boolean().prefault(false),
      小雅危险等级: z.string().prefault('无'),
      当前威胁: z.string().prefault('无'),
      事件触发时亲密度: z.coerce.number().prefault(0),
      小雅嫉妒事件结束: z.boolean().prefault(false),
      事件结束时亲密度: z.coerce.number().prefault(0),
    })
    .prefault({})
    .transform(data => {
      const $亲密度已解锁 = data.好感度 >= 30 && data.恶感度 < 50;
      return { ...data, $亲密度已解锁 };
    }),
});

$(() => {
  registerMvuSchema(Schema);
});
