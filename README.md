# Media Grabber for Vivaldi

Finds direct video and audio files plus common image formats (JPEG, PNG, GIF, WebP, AVIF, BMP) exposed by the current page. It scans HTML5 `<video>` and `<audio>` sources, media links, and rendered images, including Pinterest pin images. Pick a result and start a browser download.

The popup can preview images and play compatible audio/video files inline. The interface follows the browser's UI language, with Russian and English translations; unsupported browser languages fall back to English.

It does not extract segmented or protected playback streams, DRM media, blob URLs, or YouTube player streams. Only download media you have permission to save.

## Install

1. Open `vivaldi://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `media-link-downloader` folder.
4. Open a page with direct media links, click the extension icon, then **Найти медиа**.
