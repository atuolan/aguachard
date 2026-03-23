// 性爱场景中冻结亲密值和冷淡值
// 通过 MVU VARIABLE_UPDATE_ENDED 事件，在变量更新后检查是否处于性爱场景
// 如果是，则将亲密值和冷淡值回滚到更新前的值

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');

    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
      const inScene = _.get(new_variables, 'stat_data.黎靖青.性爱场景中');
      if (inScene) {
        // 冻结：将冷淡值和亲密值回滚到更新前的值
        const old冷淡 = _.get(old_variables, 'stat_data.黎靖青.冷淡值');
        const old亲密 = _.get(old_variables, 'stat_data.黎靖青.亲密值');
        _.set(new_variables, 'stat_data.黎靖青.冷淡值', old冷淡);
        _.set(new_variables, 'stat_data.黎靖青.亲密值', old亲密);
        console.info('[性爱场景锁定] 冷淡值和亲密值已冻结');
      }
    });
  })();
});