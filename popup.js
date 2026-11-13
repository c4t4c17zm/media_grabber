const scanButton = document.getElementById('scan');
const statusNode = document.getElementById('status');
const listNode = document.getElementById('list');

scanButton.addEventListener('click', scan);

async function scan() {
  listNode.replaceChildren();
  statusNode.textContent = 'Ищу видео, аудио и изображения…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Открой обычную веб-страницу и попробуй снова.');
    const [{ result = [] } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: findMedia });
    if (!result.length) {
      statusNode.textContent = 'Прямые медиафайлы на этой странице не найдены.';
      return;
    }
    statusNode.textContent = `Найдено: ${result.length}`;
    result.forEach(item => listNode.append(makeItem(item)));
  } catch (error) {
    statusNode.textContent = error?.message || 'Не удалось просканировать страницу.';
  }
}

function findMedia() {
  const extensions = /\.(mp4|webm|mov|m4v|ogv|avi|mp3|m4a|aac|wav|ogg|flac|jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
  const imageExtensions = /\.(jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
  const found = new Map();
  const add = (rawUrl, label, type = '', category = 'Медиа') => {
    if (!rawUrl) return;
    try {
      const url = new URL(rawUrl, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || !extensions.test(url.href)) return;
      const kind = imageExtensions.test(url.href) || category === 'Изображение' ? 'Изображение' : category;
      if (!found.has(url.href)) found.set(url.href, { url: url.href, label, type, category: kind });
    } catch (_) {}
  };

  document.querySelectorAll('video, audio').forEach((media, index) => {
    const tag = media.tagName.toLowerCase();
    const sources = [media.currentSrc, media.src, ...[...media.querySelectorAll('source')].map(source => source.src)];
    sources.forEach((url, sourceIndex) => add(url, `${tag === 'video' ? 'Видео' : 'Аудио'} ${index + 1}${sourceIndex ? ` · источник ${sourceIndex + 1}` : ''}`, media.getAttribute('type') || '', tag === 'video' ? 'Видео' : 'Аудио'));
  });

  document.querySelectorAll('a[href]').forEach((anchor, index) => {
    const href = anchor.href;
    if (extensions.test(href)) add(href, anchor.innerText.trim() || `Файл ${index + 1}`, anchor.type || '');
  });

  // Pinterest pins and many galleries render their media as ordinary <img> tags.
  document.querySelectorAll('img').forEach((image, index) => {
    if (image.naturalWidth < 100 && image.naturalHeight < 100) return;
    const candidates = new Set([image.currentSrc, image.src]);
    for (const source of image.getAttribute('srcset')?.split(',') || []) candidates.add(source.trim().split(/\s+/)[0]);
    const pinterestImage = (() => { try { return new URL(image.currentSrc || image.src, location.href).hostname.endsWith('pinimg.com'); } catch (_) { return false; } })();
    for (const candidate of candidates) {
      if (imageExtensions.test(candidate || '') || pinterestImage) {
        const size = image.naturalWidth && image.naturalHeight ? ` · ${image.naturalWidth}×${image.naturalHeight}` : '';
        add(candidate, `Изображение ${index + 1}${size}`, image.getAttribute('type') || 'image', 'Изображение');
      }
    }
  });
  return [...found.values()];
}

function makeItem(item) {
  const row = document.createElement('article');
  row.className = 'item';
  const top = document.createElement('div');
  top.className = 'top';
  const label = document.createElement('div');
  label.className = 'kind';
  label.textContent = `${item.category}: ${item.label}`;
  const button = document.createElement('button');
  button.className = 'download';
  button.textContent = 'Скачать';
  button.addEventListener('click', async () => {
    try {
      await chrome.downloads.download({ url: item.url, filename: filenameFromUrl(item.url), saveAs: true });
      button.textContent = 'Запущено';
      button.disabled = true;
    } catch (error) {
      statusNode.textContent = error?.message || 'Не удалось начать скачивание.';
    }
  });
  top.append(label, button);
  const detail = document.createElement('div');
  detail.className = 'detail';
  detail.textContent = item.type ? `${item.type} · ${item.url}` : item.url;
  row.append(top, detail);
  return row;
}

function filenameFromUrl(rawUrl) {
  try {
    const name = decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).pop() || 'media-file');
    return name.replace(/[\\/:*?"<>|]/g, '_');
  } catch (_) { return 'media-file'; }
}
