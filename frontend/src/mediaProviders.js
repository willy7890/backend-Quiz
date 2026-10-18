const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const videoExtensions = ['.mp4', '.webm', '.ogg'];

export function resolveVideoUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { provider: 'unsupported', label: 'Unsupported URL', normalizedUrl: '', embedUrl: '', error: 'Enter a valid video URL.' };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const isDomain = labels.length >= 2 && labels.every(label => domainLabel.test(label));
  const isNumericAddress = labels.every(label => /^(?:\d+|0x[0-9a-f]+)$/i.test(label));
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || !isDomain
    || isNumericAddress
    || host.includes(':')
  ) {
    return { provider: 'unsupported', label: 'Unsupported URL', normalizedUrl: '', embedUrl: '', error: 'Use a public HTTPS URL.' };
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const params = url.searchParams;
  if (youtubeHosts.has(host)) {
    const match = host === 'youtu.be'
      ? path.match(/^\/([A-Za-z0-9_-]{11})$/)
      : path === '/watch'
        ? [null, params.get('v')]
        : path.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})$/);
    const id = match?.[1];
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return invalid('Enter a valid YouTube video or Shorts URL.');
    const isShort = path.startsWith('/shorts/');
    return {
      provider: 'youtube',
      label: 'YouTube',
      normalizedUrl: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }
  if (['tiktok.com', 'www.tiktok.com'].includes(host)) {
    const match = path.match(/^\/@([A-Za-z0-9._-]+)\/video\/(\d+)$/);
    if (!match) return invalid('Use the full public TikTok video URL; shortened links cannot be resolved safely.');
    return {
      provider: 'tiktok',
      label: 'TikTok',
      normalizedUrl: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
      embedUrl: `https://www.tiktok.com/player/v1/${match[2]}`,
    };
  }
  if (['instagram.com', 'www.instagram.com'].includes(host)) {
    const match = path.match(/^\/(reel|p|tv)\/([A-Za-z0-9_-]+)$/);
    if (!match) return invalid('Enter a supported public Instagram Reel or post URL.');
    return {
      provider: 'instagram',
      label: 'Instagram',
      normalizedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      embedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`,
    };
  }
  if (['linkedin.com', 'www.linkedin.com'].includes(host)) {
    let urn = null;
    if (path.startsWith('/feed/update/')) {
      const match = path.match(/^\/feed\/update\/(urn:li:(?:activity|share):\d+)$/);
      urn = match?.[1] || null;
    } else if (path.startsWith('/posts/')) {
      const match = path.match(/(?:^|[_-])activity-(\d+)/);
      urn = match ? `urn:li:activity:${match[1]}` : null;
    } else {
      return invalid('Enter a public LinkedIn post URL.');
    }
    return {
      provider: 'linkedin',
      label: 'LinkedIn',
      normalizedUrl: `https://www.linkedin.com${path}`,
      embedUrl: urn ? `https://www.linkedin.com/embed/feed/update/${urn}?compact=1` : '',
      note: urn ? '' : 'LinkedIn does not expose an embeddable post ID in this URL.',
    };
  }
  if (videoExtensions.some(extension => path.toLowerCase().endsWith(extension))) {
    url.hash = '';
    return { provider: 'direct', label: 'Direct video', normalizedUrl: url.toString(), embedUrl: '' };
  }
  url.hash = '';
  return {
    provider: 'external',
    label: 'External link',
    normalizedUrl: url.toString(),
    embedUrl: '',
    note: 'This link does not match a supported inline video format.',
    error: 'Use a supported YouTube, TikTok, Instagram, LinkedIn, MP4, WebM, or OGG URL.',
  };
}

function invalid(error) {
  return { provider: 'unsupported', label: 'Unsupported URL', normalizedUrl: '', embedUrl: '', error };
}
