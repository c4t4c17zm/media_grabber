const scanButton = document.getElementById('scan');
const statusNode = document.getElementById('status');
const listNode = document.getElementById('list');

document.documentElement.lang = chrome.i18n.getUILanguage();
document.querySelectorAll('[data-i18n]').forEach(node => {
  node.textContent = chrome.i18n.getMessage(node.dataset.i18n);
});

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

scanButton.addEventListener('click', scan);

async function scan() {
  listNode.replaceChildren();
  statusNode.textContent = t('scanning');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error(t('invalidPage'));
    const [{ result = [] } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: findMedia });
    if (!result.length) {
      statusNode.textContent = t('noMedia');
      return;
    }
    statusNode.textContent = t('foundCount', String(result.length));
    result.forEach(item => listNode.append(makeItem(item)));
  } catch (error) {
    statusNode.textContent = error?.message || t('scanError');
  }
}

function findMedia() {
  const extensions = /\.(mp4|webm|mov|m4v|ogv|avi|mp3|m4a|aac|wav|ogg|flac|jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
  const imageExtensions = /\.(jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
  const videoExtensions = /\.(mp4|webm|mov|m4v|ogv|avi)(?:$|[?#])/i;
  const audioExtensions = /\.(mp3|m4a|aac|wav|ogg|flac)(?:$|[?#])/i;
  const found = new Map();
  const add = (rawUrl, label, type = '', category = 'media') => {
    if (!rawUrl) return;
    try {
      const url = new URL(rawUrl, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || !extensions.test(url.href)) return;
      let kind = imageExtensions.test(url.href) || category === 'image' ? 'image' : category;
      if (kind === 'media' && videoExtensions.test(url.href)) kind = 'video';
      if (kind === 'media' && audioExtensions.test(url.href)) kind = 'audio';
      if (!found.has(url.href)) found.set(url.href, { url: url.href, label, type, category: kind });
    } catch (_) {}
  };

  document.querySelectorAll('video, audio').forEach((media, index) => {
    const tag = media.tagName.toLowerCase();
    const sources = [media.currentSrc, media.src, ...[...media.querySelectorAll('source')].map(source => source.src)];
    sources.forEach((url, sourceIndex) => add(url, `${index + 1}${sourceIndex ? ` · ${sourceIndex + 1}` : ''}`, media.getAttribute('type') || '', tag === 'video' ? 'video' : 'audio'));
  });

  document.querySelectorAll('a[href]').forEach((anchor, index) => {
    const href = anchor.href;
    if (extensions.test(href)) add(href, anchor.innerText.trim() || String(index + 1), anchor.type || '');
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
        add(candidate, `${index + 1}${size}`, image.getAttribute('type') || 'image', 'image');
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
  label.textContent = `${t(item.category)} ${item.label}`;
  const button = document.createElement('button');
  button.className = 'download';
  button.textContent = t('download');
  button.addEventListener('click', async () => {
    try {
      await chrome.downloads.download({ url: item.url, filename: filenameFromUrl(item.url), saveAs: true });
      button.textContent = t('started');
      button.disabled = true;
    } catch (error) {
      statusNode.textContent = error?.message || t('downloadError');
    }
  });
  top.append(label, button);
  const detail = document.createElement('div');
  detail.className = 'detail';
  detail.textContent = item.type ? `${item.type} · ${item.url}` : item.url;
  const previewButton = document.createElement('button');
  previewButton.className = 'download preview-toggle';
  previewButton.textContent = t('preview');
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.hidden = true;
  previewButton.addEventListener('click', () => {
    preview.hidden = !preview.hidden;
    previewButton.textContent = preview.hidden ? t('preview') : t('hidePreview');
    if (!preview.hidden && !preview.childElementCount) appendPreview(preview, item);
  });
  row.append(top, detail, previewButton, preview);
  return row;
}

function appendPreview(container, item) {
  let element;
  if (item.category === 'image') {
    element = document.createElement('img');
    element.alt = item.label;
    element.src = item.url;
    const open = document.createElement('a');
    open.href = item.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.append(element);
    container.append(open);
  } else if (item.category === 'video' || item.category === 'audio') {
    element = document.createElement(item.category);
    element.controls = true;
    element.preload = 'metadata';
    element.src = item.url;
    container.append(element);
  } else {
    const message = document.createElement('div');
    message.className = 'preview-error';
    message.textContent = t('previewError');
    container.append(message);
    return;
  }
  element.addEventListener('error', () => {
    const message = document.createElement('div');
    message.className = 'preview-error';
    message.textContent = t('previewError');
    container.append(message);
  }, { once: true });
}

function filenameFromUrl(rawUrl) {
  try {
    const name = decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).pop() || 'media-file');
    return name.replace(/[\\/:*?"<>|]/g, '_');
  } catch (_) { return 'media-file'; }
}
