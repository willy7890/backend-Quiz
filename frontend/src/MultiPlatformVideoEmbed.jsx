import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Instagram, Linkedin, Maximize2, Minimize2, Music2, Youtube } from 'lucide-react';
import { resolveVideoUrl } from './mediaProviders.js';

const providerIcons = {
  youtube: Youtube,
  tiktok: Music2,
  instagram: Instagram,
  linkedin: Linkedin,
  direct: ExternalLink,
};

export function FullscreenPreview({ children, title, className = '' }) {
  const frameRef = useRef(null);
  const [fullscreenError, setFullscreenError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => {
      const frame = frameRef.current;
      const nativeFullscreen = document.fullscreenElement === frame
        || document.webkitFullscreenElement === frame;
      setExpanded(nativeFullscreen || frame?.dataset.fallbackFullscreen === 'true');
    };
    const onKeyDown = event => {
      if (event.key === 'Escape' && frameRef.current?.dataset.fallbackFullscreen === 'true') {
        frameRef.current.dataset.fallbackFullscreen = 'false';
        setExpanded(false);
      }
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  async function enterFullscreen() {
    setFullscreenError('');
    try {
      const frame = frameRef.current;
      if (expanded) {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
        else {
          frame.dataset.fallbackFullscreen = 'false';
          setExpanded(false);
        }
      } else if (frame?.requestFullscreen) {
        await frame.requestFullscreen();
        setExpanded(true);
      } else if (frame?.webkitRequestFullscreen) {
        frame.webkitRequestFullscreen();
        setExpanded(true);
      } else {
        frame.dataset.fallbackFullscreen = 'true';
        setExpanded(true);
      }
    } catch {
      if (frameRef.current) {
        frameRef.current.dataset.fallbackFullscreen = 'true';
        setExpanded(true);
      } else {
        setFullscreenError('Fullscreen could not be opened. Use the resource link instead.');
      }
    }
  }

  return <div ref={frameRef} className={`media-fullscreen-frame ${expanded ? 'is-expanded' : ''} ${className}`}>
    <button className="media-fullscreen-button" type="button" onClick={enterFullscreen} aria-label={`${expanded ? 'Exit' : 'View'} ${title || 'preview'} fullscreen`}>
      {expanded ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}<span>{expanded ? 'Exit fullscreen' : 'Fullscreen'}</span>
    </button>
    {children}
    {fullscreenError && <span className="media-fullscreen-error" role="status">{fullscreenError}</span>}
  </div>;
}

export default function MultiPlatformVideoEmbed({
  url,
  title,
  thumbnail,
  active = true,
  autoplay = false,
  muted = true,
  portrait = false,
}) {
  const media = resolveVideoUrl(url);
  const directRef = useRef(null);
  const iframeRef = useRef(null);
  const [embedStatus, setEmbedStatus] = useState('loading');
  const [videoError, setVideoError] = useState('');
  const [tiktokReady, setTiktokReady] = useState(false);
  const PlayerIcon = providerIcons[media.provider] || ExternalLink;

  useEffect(() => {
    if (media.provider !== 'direct' || !directRef.current) return;
    const player = directRef.current;
    player.muted = muted;
    if (active && autoplay) {
      player.play().catch(() => setVideoError('Playback was blocked. Use the video controls to start playback.'));
    } else if (!active) {
      player.pause();
    }
  }, [active, autoplay, media.provider, muted, url]);

  useEffect(() => {
    if (media.provider !== 'tiktok' || !active) return undefined;
    const handleMessage = event => {
      if (event.origin !== 'https://www.tiktok.com' || event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (!message?.['x-tiktok-player']) return;
      if (message.type === 'onPlayerReady') setTiktokReady(true);
      if (message.type === 'onPlayerError') setEmbedStatus('error');
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active, media.provider]);

  useEffect(() => {
    if (media.provider !== 'tiktok' || !tiktokReady || !iframeRef.current?.contentWindow) return;
    const target = iframeRef.current.contentWindow;
    const send = type => target.postMessage({ 'x-tiktok-player': true, type }, 'https://www.tiktok.com');
    send(muted ? 'mute' : 'unMute');
    if (active && autoplay) send('play');
    else send('pause');
  }, [active, autoplay, media.provider, muted, tiktokReady, url]);

  useEffect(() => {
    if (!active || !media.embedUrl) return undefined;
    setTiktokReady(false);
    setEmbedStatus('loading');
    const timeout = window.setTimeout(() => {
      setEmbedStatus(current => current === 'loading' ? 'timeout' : current);
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [active, media.embedUrl]);

  if (media.provider === 'unsupported') {
    return <div className="mve-fallback" role="alert">
      <PlayerIcon size={22}/><p>{media.error}</p>
    </div>;
  }

  const aspectClass = portrait ? 'mve-portrait' : 'mve-landscape';
  if (!active) {
    return <div className={`mve-player ${aspectClass} mve-inactive`} aria-label={`${title} video player`}>
      {thumbnail && <img src={thumbnail} alt="" loading="lazy"/>}
      <span>Scroll to this video to load its player.</span>
    </div>;
  }

  if (media.provider === 'direct') {
    return <FullscreenPreview title={title} className={`mve-player ${aspectClass}`}>
      <video
        ref={directRef}
        src={media.normalizedUrl}
        title={title}
        poster={thumbnail || undefined}
        controls
        playsInline
        loop={portrait}
        muted={muted}
        autoPlay={autoplay}
        preload="metadata"
        onCanPlay={() => setVideoError('')}
        onError={() => setVideoError('This video could not be played here. It may be private, unavailable, or served with unsupported media settings.')}
      />
      {videoError && <p className="mve-status" role="status">{videoError}</p>}
      <a className="mve-external-link" href={media.normalizedUrl} target="_blank" rel="noreferrer">
        Open direct video <ExternalLink size={13}/>
      </a>
    </FullscreenPreview>;
  }

  if (!media.embedUrl) {
    return <div className={`mve-fallback ${aspectClass}`}>
      <PlayerIcon size={22}/><p>{media.note || `${media.label} does not expose an embeddable URL for this post.`}</p>
      <a href={media.normalizedUrl} target="_blank" rel="noreferrer">Open on {media.label} <ExternalLink size={13}/></a>
    </div>;
  }

  const params = new URLSearchParams();
  if (media.provider === 'youtube') {
    params.set('autoplay', autoplay ? '1' : '0');
    params.set('mute', muted ? '1' : '0');
    params.set('playsinline', '1');
    params.set('rel', '0');
  } else if (media.provider === 'tiktok') {
    params.set('autoplay', '0');
    params.set('controls', '1');
    params.set('fullscreen_button', '1');
    params.set('volume_control', '1');
    params.set('loop', portrait ? '1' : '0');
  }
  const embedUrl = params.size
    ? `${media.embedUrl}${media.embedUrl.includes('?') ? '&' : '?'}${params}`
    : media.embedUrl;
  const allow = media.provider === 'youtube'
    ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen'
    : 'autoplay; encrypted-media; picture-in-picture; fullscreen';

  return <FullscreenPreview title={title} className={`mve-player ${aspectClass}`}>
    <iframe
      src={embedUrl}
      ref={media.provider === 'tiktok' ? iframeRef : undefined}
      title={`${title} on ${media.label}`}
      allow={allow}
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => setEmbedStatus('loaded')}
      onError={() => setEmbedStatus('error')}
    />
    {embedStatus === 'loading' && <span className="mve-status" role="status">Loading {media.label} embed…</span>}
    {embedStatus === 'timeout' && <span className="mve-status" role="status">The embed is taking longer than expected. Playback may be restricted by {media.label}.</span>}
    {embedStatus === 'error' && <span className="mve-status" role="status">This {media.label} embed could not be loaded here.</span>}
    {embedStatus === 'loaded' && <span className="mve-status" role="status">{media.label} embed loaded. The provider may still restrict playback for this post.</span>}
    <a className="mve-external-link" href={media.normalizedUrl} target="_blank" rel="noreferrer">
      Open on {media.label} <ExternalLink size={13}/>
    </a>
  </FullscreenPreview>;
}
