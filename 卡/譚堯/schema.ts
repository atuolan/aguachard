export const Schema = z.object({
  谭尧: z
    .object({
      好感度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      恶感度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      警惕值: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      亲密度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      时间: z.string().prefault('4/22 - 周三 - 上午 - 10:22 - 阴雨'),
      心情: z.string().prefault('烦躁、漠然'),
      想法: z.string().prefault('暂无'),
      约定与代办事项: z.string().prefault('暂无'),
    })
    .prefault({})
    .transform(data => {
      const $亲密度已解锁 = data.好感度 >= 30 && data.恶感度 < 50;
      return { ...data, $亲密度已解锁 };
    }),
});
export type Schema = z.output<typeof Schema>;
