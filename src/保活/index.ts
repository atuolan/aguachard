import { createScriptIdDiv, teleportStyle } from '@util/script';
import { createApp } from 'vue';
import Panel from './Panel.vue';

document.addEventListener('DOMContentLoaded', () => {
  const app = createApp(Panel);
  const $container = createScriptIdDiv().appendTo('#extensions_settings2');
  app.mount($container[0]);
  const { destroy } = teleportStyle();

  window.addEventListener('pagehide', () => {
    app.unmount();
    $container.remove();
    destroy();
  });
});
