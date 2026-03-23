import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  世界: z
    .object({
      时间点: z.string().prefault('03月15日-星期三-春-上午-晴-09:00'),
    })
    .prefault({}),

  user: z
    .object({
      识破身份: z.enum(['未识破', '识破']).prefault('未识破'),
    })
    .prefault({}),

  '黎靖青/穷云海': z
    .object({
      认出聊天对象: z.enum(['未认出', '认出']).prefault('未认出'),
    })
    .prefault({}),

  黎靖青: z
    .object({
      目前身份: z.enum(['黎靖青', '穷云海']).prefault('黎靖青'),
      目前模式: z.enum(['上司', '伪娘', '私下状态', '恋人']).prefault('上司'),
      心情: z.string().prefault('冷静'),
      冷淡值: z.coerce
        .number()
        .prefault(100)
        .transform(v => _.clamp(v, 0, 100)),
      亲密值: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      兴奋值: z.coerce
        .number()
        .prefault(0)
        .transform(v => _.clamp(v, 0, 100)),
      性爱场景中: z.boolean().prefault(false),
      内心想法: z.string().prefault(''),
      待办事项: z.string().prefault('无'),
    })
    .prefault({}),

  event_data: z
    .object({
      身份试探: z
        .object({
          进行中: z.boolean().prefault(false),
          已完成: z.boolean().prefault(false),
          消息进度: z.string().prefault('Not yet triggered'),
          识破状态: z.string().prefault(''),
          可直接询问: z.boolean().prefault(false),
        })
        .prefault({}),
    })
    .prefault({}),
});

$(() => {
  registerMvuSchema(Schema);
});
