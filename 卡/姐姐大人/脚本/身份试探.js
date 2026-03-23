const Schema = z.object({
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

/**
 * 身份试探事件自动处理脚本
 * 1. 监听亲密值和冷淡值，自动触发身份试探事件
 * 2. 在事件进行中锁定亲密值和冷淡值
 * 3. 检测用户回应关键词，自动判断事件完成
 */
const COMPLETION_KEYWORDS = [
  '我接受你',
  '我接受',
  '我都喜欢',
  '两个都',
  '没关系',
  '我知道了',
  '我明白',
  '你就是你',
  '不管哪个你',
  '都是你',
  '真实的你',
  '完整的你',
  '我爱你',
  '我喜欢你',
  '我在意的是你',
  '不会改变',
  '一直都是',
  '黎靖青也好',
  '穷云海也好',
  '男装也好',
  '女装也好',
  '我选择',
  '只要你',
  '就是你',
  '是的',
  '对',
  '没错',
  '当然',
  '我确定',
  '无论如何',
  '不管怎样',
  '都可以',
  '我懂',
  '我理解',
  '你的苦衷',
  '不能接受',
  '无法接受',
  '太奇怪',
  '难以理解',
  '需要时间',
  '让我想想',
  '太突然',
  '为什么',
  '真的吗',
  '骗人',
  '欺骗',
];

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');

    // 锁定亲密值和冷淡值
    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
      const oldData = Schema.parse(_.get(variables_before_update, 'stat_data', {}));
      const eventState = oldData.event_data.身份试探;

      if (!eventState.进行中) return;

      const oldCold = oldData.黎靖青.冷淡值;
      const oldIntimacy = oldData.黎靖青.亲密值;
      const newData = Schema.parse(_.get(variables, 'stat_data', {}));

      if (newData.黎靖青.冷淡值 !== oldCold) {
        _.set(variables, 'stat_data.黎靖青.冷淡值', oldCold);
        console.info(`[身份试探] 锁定冷淡值: ${oldCold} (试图变更为 ${newData.黎靖青.冷淡值})`);
      }
      if (newData.黎靖青.亲密值 !== oldIntimacy) {
        _.set(variables, 'stat_data.黎靖青.亲密值', oldIntimacy);
        console.info(`[身份试探] 锁定亲密值: ${oldIntimacy} (试图变更为 ${newData.黎靖青.亲密值})`);
      }
    });

    // 事件触发与完成检测
    eventOn(Mvu.events.BEFORE_MESSAGE_UPDATE, context => {
      const variables = context.variables;
      const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));

      const intimacy = stat_data.黎靖青.亲密值;
      const coldness = stat_data.黎靖青.冷淡值;
      const eventState = stat_data.event_data.身份试探;

      if (eventState.已完成) return;

      const shouldTrigger = intimacy >= 58 && intimacy <= 68 && coldness <= 50;
      if (!shouldTrigger) return;

      if (!eventState.进行中) {
        _.set(variables, 'stat_data.event_data.身份试探.进行中', true);
        _.set(variables, 'stat_data.event_data.身份试探.识破状态', stat_data.user.识破身份);
        _.set(variables, 'stat_data.event_data.身份试探.消息进度', '0/20');
        console.info(`[身份试探] 事件触发 亲密值=${intimacy} 冷淡值=${coldness}`);
        return;
      }

      const progressMatch = eventState.消息进度.match(/^(\d+)\/20$/);
      let progress = progressMatch ? parseInt(progressMatch[1]) : 0;
      progress++;

      const canDirectlyAsk = progress >= 20;
      _.set(variables, 'stat_data.event_data.身份试探.消息进度', `${progress}/20`);
      _.set(variables, 'stat_data.event_data.身份试探.可直接询问', canDirectlyAsk);

      console.info(`[身份试探] 进度 ${progress}/20`);

      if (canDirectlyAsk) {
        const chatMessages = getChatMessages(-1, { role: 'user' });
        const latestUserMsg = chatMessages.length > 0 ? chatMessages[0].message : '';
        const hasKeyword = COMPLETION_KEYWORDS.some(kw => latestUserMsg.includes(kw));

        if (hasKeyword) {
          _.set(variables, 'stat_data.event_data.身份试探.已完成', true);
          _.set(variables, 'stat_data.event_data.身份试探.进行中', false);
          _.set(variables, 'stat_data.event_data.身份试探.消息进度', '已完成');
          console.info(`[身份试探] 事件完成 用户回应: ${latestUserMsg.substring(0, 50)}`);
        }
      }
    });

    // F12 调试接口
    window.checkIdentityTestEvent = () => {
      const data = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      const stat_data = Schema.parse(_.get(data, 'stat_data', {}));
      const event = stat_data.event_data.身份试探;
      console.info('========================================');
      console.info('身份试探事件 - 当前状态');
      console.info(`进行中: ${event.进行中}`);
      console.info(`已完成: ${event.已完成}`);
      console.info(`消息进度: ${event.消息进度}`);
      console.info(`亲密值: ${stat_data.黎靖青.亲密值}`);
      console.info(`冷淡值: ${stat_data.黎靖青.冷淡值}`);
      console.info(`识破状态: ${event.识破状态}`);
      console.info('========================================');
      return event;
    };

    console.info('[身份试探] 脚本初始化完成');
  })();
});

$(window).on('pagehide', () => {
  delete window.checkIdentityTestEvent;
  console.info('[身份试探] 脚本已卸载');
});
