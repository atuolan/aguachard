import { createApp, type App as VueApp } from 'vue';
import { createScriptIdDiv, teleportStyle } from '../../util/script';
import App from './App.vue';

const BUTTON_NAME = '打开木鳥预设面板';
const CUSTOM_EVENT = '木鳥预设控制面板:打开';

let app: VueApp<Element> | null = null;
let $app: JQuery<HTMLDivElement> | null = null;
let style_handle: { destroy: () => void } | null = null;

function unmountPanel() {
  app?.unmount();
  $app?.remove();
  style_handle?.destroy();
  app = null;
  $app = null;
  style_handle = null;
}

function mountPanel() {
  if (app) {
    // 已打开则视为关闭, 方便重复点击按钮切换
    unmountPanel();
    return;
  }

  // 将脚本 iframe 内的样式复制到酒馆页面 <head>, 否则挂载到酒馆页面的组件没有样式
  style_handle = teleportStyle();

  $app = createScriptIdDiv().appendTo('body');
  app = createApp(App, { onClose: () => unmountPanel() });
  app.mount($app[0]);
}

$(() => {
  errorCatched(() => {
    appendInexistentScriptButtons([{ name: BUTTON_NAME, visible: true }]);
    eventOn(getButtonEvent(BUTTON_NAME), () => errorCatched(mountPanel)());
    eventOn(CUSTOM_EVENT, () => errorCatched(mountPanel)());
    console.info('[木鳥预设控制面板] 脚本已加载');
  })();

  $(window).on('pagehide', unmountPanel);
});
