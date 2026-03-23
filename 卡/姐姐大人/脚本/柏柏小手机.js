async function loadScript(urls) {
  if (!Array.isArray(urls)) urls = [urls]; // 支持单个或多个 URL
  for (const url of urls) {
    try {
      await import(url);
      console.log(`✅ 成功加载: ${url}`);
      return;
    } catch (err) {
      console.warn(`⚠️ 加载失败: ${url}`, err);
    }
  }
  toastr.error('手机加载失败,请开启梯子');
}

const date = new Date();
const day = date.getDate();
const hour = date.getHours();
loadScript([`https://cdn.jsdelivr.net/gh/baibai-git/baibai_phone/index.js?day=${day}&hour=${hour}`]);