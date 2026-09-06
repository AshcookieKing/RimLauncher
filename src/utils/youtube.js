/** Normalize YouTube URLs for Electron embeds (Error 153 needs nocookie + referer). */

export function youtubeIdFromUrl(url) {
  const m = String(url || '').match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,})/i
  );
  return m ? m[1] : null;
}

/** Embed URL for iframe inside Electron (file://). */
export function youtubeEmbedUrl(urlOrId) {
  const id = youtubeIdFromUrl(urlOrId) || (/^[A-Za-z0-9_-]{6,}$/.test(String(urlOrId || '')) ? urlOrId : null);
  if (!id) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** Watch page for external browser fallback. */
export function youtubeWatchUrl(urlOrId) {
  const id = youtubeIdFromUrl(urlOrId) || (/^[A-Za-z0-9_-]{6,}$/.test(String(urlOrId || '')) ? urlOrId : null);
  if (!id) return String(urlOrId || '');
  return `https://www.youtube.com/watch?v=${id}`;
}
