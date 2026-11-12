export interface YouTubeRef {
  videoId: string | null;
  listId: string | null;
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Aceita links do YouTube e do YouTube Music (vídeo ou playlist) ou um ID puro. */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return { videoId: raw, listId: null };
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const okHosts = ['youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'];
  if (!okHosts.includes(host)) return null;
  let videoId: string | null = null;
  const listId = url.searchParams.get('list');
  if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0] || null;
  else if (url.pathname === '/watch') videoId = url.searchParams.get('v');
  else {
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) videoId = m[1];
  }
  if (videoId && !ID_RE.test(videoId)) videoId = null;
  if (!videoId && !listId) return null;
  return { videoId, listId: listId && /^[A-Za-z0-9_-]{10,64}$/.test(listId) ? listId : null };
}
