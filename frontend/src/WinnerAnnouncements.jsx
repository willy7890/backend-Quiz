import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Trophy, X } from 'lucide-react';

function wrapText(context, text, x, y, maxWidth, fontSize, maxLines) {
  let size = fontSize;
  let lines = [];
  while (size >= 32) {
    context.font = `700 ${size}px Georgia, serif`;
    lines = [];
    for (const paragraph of String(text || '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    if (lines.length <= maxLines) break;
    size -= 2;
  }

  context.font = `700 ${size}px Georgia, serif`;
  lines.slice(0, maxLines).forEach((line, index) => {
    let visibleLine = line;
    while (context.measureText(`${visibleLine}…`).width > maxWidth && visibleLine.length > 1) {
      visibleLine = visibleLine.slice(0, -1);
    }
    context.fillText(index === maxLines - 1 && lines.length > maxLines ? `${visibleLine}…` : visibleLine, x, y + index * (size + 10));
  });
  return { size, lineCount: Math.min(lines.length, maxLines) };
}

function loadAvatar(source) {
  return new Promise(resolve => {
    if (!source) {
      resolve(null);
      return;
    }
    const image = new Image();
    let settled = false;
    const timeout = window.setTimeout(() => finish(null), 5000);
    const finish = result => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(result);
    };
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = source;
  });
}

function loadBrandLogo() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error('The SigniAI logo could not be loaded. Poster generation was canceled.')), 5000);
    const finish = callback => value => {
      window.clearTimeout(timeout);
      callback(value);
    };
    image.onload = finish(() => resolve(image));
    image.onerror = finish(() => reject(new Error('The SigniAI logo could not be loaded. Poster generation was canceled.')));
    image.src = '/signiai-logo.svg';
  });
}

async function drawPoster(canvas, announcement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create the poster image.');
  const { winner } = announcement;
  const [avatar, logo] = await Promise.all([
    loadAvatar(winner.avatar_data),
    loadBrandLogo(),
  ]);
  const width = canvas.width;
  const height = canvas.height;

  context.fillStyle = '#f7f9fc';
  context.fillRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#ffffff');
  background.addColorStop(1, '#eef4fb');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#e6f6f2';
  context.beginPath();
  context.arc(970, 170, 230, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#e9efff';
  context.beginPath();
  context.arc(50, 1200, 260, 0, Math.PI * 2);
  context.fill();

  const confetti = [
    [100, 210, '#41b99c'], [970, 480, '#e1b45a'], [930, 900, '#6588db'],
    [145, 820, '#e1b45a'], [860, 1130, '#41b99c'], [260, 1180, '#6588db'],
  ];
  confetti.forEach(([x, y, color], index) => {
    context.save();
    context.translate(x, y);
    context.rotate(index % 2 ? 0.55 : -0.55);
    context.fillStyle = color;
    context.fillRect(0, 0, 13, 28);
    context.restore();
  });

  context.fillStyle = '#ffffff';
  context.strokeStyle = '#d9e3ed';
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(88, 48, 260, 126, 14);
  context.fill();
  context.stroke();

  const logoWidth = 210;
  const logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
  context.drawImage(logo, 108, 60, logoWidth, logoHeight);
  context.fillStyle = '#4a6586';
  context.font = '600 16px Arial, sans-serif';
  context.letterSpacing = '4px';
  context.fillText('BACKEND QUIZ CHALLENGE', 108, 158);

  context.strokeStyle = '#d4e0ed';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(108, 195);
  context.lineTo(972, 195);
  context.stroke();

  context.fillStyle = '#237c6f';
  context.font = '700 18px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText('OFFICIAL CHALLENGE WINNER', 540, 260);

  context.save();
  context.beginPath();
  context.arc(540, 414, 102, 0, Math.PI * 2);
  context.fillStyle = '#e1f0ef';
  context.fill();
  context.clip();
  if (avatar) {
    const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
    context.drawImage(
      avatar,
      (avatar.naturalWidth - side) / 2,
      (avatar.naturalHeight - side) / 2,
      side,
      side,
      438,
      312,
      204,
      204,
    );
  } else {
    context.fillStyle = '#d9ece9';
    context.fillRect(438, 312, 204, 204);
    context.fillStyle = '#17675d';
    context.font = '700 88px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText((winner.name || '?').trim().charAt(0).toLocaleUpperCase(), 540, 415);
  }
  context.restore();

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#132a49';
  context.font = '700 72px Georgia, serif';
  context.fillText('Congratulations,', 540, 595);
  context.fillStyle = '#1d796e';
  const nameLayout = wrapText(context, winner.name || 'Quiz champion', 540, 665, 880, 60, 2);
  const nameBottom = 665 + nameLayout.lineCount * (nameLayout.size + 10);

  context.fillStyle = '#65758d';
  context.font = '500 21px Arial, sans-serif';
  context.letterSpacing = '2px';
  context.fillText('WINNER OF', 540, nameBottom + 30);
  context.fillStyle = '#1b2f4c';
  context.letterSpacing = '0px';
  const titleLayout = wrapText(context, announcement.challenge_title, 540, nameBottom + 78, 810, 36, 2);
  const scoreTop = Math.min(1007, Math.max(930, nameBottom + 110 + titleLayout.lineCount * 46));

  context.fillStyle = '#ffffff';
  context.strokeStyle = '#dce6ef';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(118, scoreTop, 844, 156, 22);
  context.fill();
  context.stroke();

  context.textAlign = 'center';
  context.fillStyle = '#0f2b4a';
  context.font = '700 58px Georgia, serif';
  context.fillText(String(announcement.final_score), 335, scoreTop + 68);
  context.fillStyle = '#6a7b91';
  context.font = '700 16px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText('CHALLENGE SCORE', 335, scoreTop + 104);
  context.strokeStyle = '#dce6ef';
  context.beginPath();
  context.moveTo(540, scoreTop + 24);
  context.lineTo(540, scoreTop + 132);
  context.stroke();
  context.fillStyle = '#1d796e';
  context.font = '700 52px Georgia, serif';
  context.letterSpacing = '0px';
  context.fillText(String(announcement.computers_earned), 746, scoreTop + 68);
  context.fillStyle = '#6a7b91';
  context.font = '700 16px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText(announcement.computers_earned === 1 ? 'COMPUTER EARNED' : 'COMPUTERS EARNED', 746, scoreTop + 104);
  context.fillStyle = '#8491a3';
  context.font = '500 12px Arial, sans-serif';
  context.letterSpacing = '0px';
  context.fillText(`${announcement.total_points} total points · ${announcement.computer_reward_points} points per computer`, 746, scoreTop + 132);

  const messageTop = scoreTop + 193;
  context.fillStyle = '#30435e';
  context.font = '500 22px Arial, sans-serif';
  context.letterSpacing = '0px';
  context.fillText('Your dedication and hard work made this achievement possible.', 540, messageTop);
  context.fillText('Thank you to every participant for learning and competing with us.', 540, messageTop + 40);

  context.strokeStyle = '#d4e0ed';
  context.beginPath();
  context.moveTo(108, 1270);
  context.lineTo(972, 1270);
  context.stroke();
  context.fillStyle = '#29405f';
  context.font = '700 19px Arial, sans-serif';
  context.letterSpacing = '1px';
  context.fillText('SIGNIAI  ·  BUILD SKILLS. BUILD WHAT’S NEXT.', 540, 1305);
  context.fillStyle = '#8290a3';
  context.font = '500 15px Arial, sans-serif';
  context.letterSpacing = '0px';
  context.fillText(
    `Official result · ${new Date(announcement.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`,
    540,
    1332,
  );
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
}

function safeName(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'winner';
}

export default function WinnerAnnouncements({ api, isAdmin }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [posterLoading, setPosterLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const posterRef = useRef(null);

  async function loadAnnouncements() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${api}/api/quizzes/winner-announcements`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Could not load announcements (${response.status})`);
      setAnnouncements(data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAnnouncements(); }, [api]);

  const selected = announcements.find(item => item.id === previewId);
  useEffect(() => {
    if (!selected || !posterRef.current) return;
    let active = true;
    setPosterLoading(true);
    drawPoster(posterRef.current, selected)
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setPosterLoading(false); });
    return () => { active = false; };
  }, [selected]);

  async function regenerate() {
    if (!selected || !posterRef.current) return;
    setBusy(true);
    setError('');
    try {
      await drawPoster(posterRef.current, selected);
      setNotice('Poster regenerated from the official winner record.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(announcement = selected) {
    if (!announcement) return;
    setBusy(true);
    setError('');
    try {
      const canvas = posterRef.current || document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      await drawPoster(canvas, announcement);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('The browser could not encode the poster as PNG.')), 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `signiai-winner-${safeName(announcement.winner.name)}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Winner poster downloaded as a PNG.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel winner-announcements">
    <div className="section-heading">
      <div><span className="section-kicker">OFFICIAL RESULTS</span><h2><Trophy size={22}/> Winner announcements</h2></div>
      <button className="text-button" onClick={loadAnnouncements} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </div>
    <p className="winner-intro">Published challenge winners are selected from submitted quiz results. Current leaderboard totals do not replace completed challenge results.</p>
    {error && <div className="inline-error">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    {loading ? <div className="empty-state">Loading official announcements…</div>
      : announcements.length ? <div className="winner-announcement-list">
        {announcements.map(announcement => <article className="winner-announcement-card" key={announcement.id}>
          <div className="announcement-avatar">
            <span>{announcement.winner.name.trim().charAt(0).toLocaleUpperCase()}</span>
            {announcement.winner.avatar_data && <img src={announcement.winner.avatar_data} alt={`${announcement.winner.name}'s profile`} onError={event => event.currentTarget.remove()}/>}
          </div>
          <div className="announcement-summary">
            <span className="workspace-tag published">OFFICIAL WINNER</span>
            <h3>{announcement.winner.name}</h3>
            <p>{announcement.challenge_title}</p>
            <small>Rank #{announcement.ranking} · {announcement.final_score} challenge points · {announcement.total_points} total points · {announcement.computers_earned} {announcement.computers_earned === 1 ? 'computer' : 'computers'}</small>
            <small>Published {new Date(announcement.published_at).toLocaleDateString()}</small>
          </div>
          <div className="announcement-actions">
            <button className="text-button" onClick={() => { setNotice(''); setPreviewId(announcement.id); }}>Preview Poster</button>
            <button className="workspace-primary" onClick={() => download(announcement)} disabled={busy}><Download size={15}/> Download Poster</button>
          </div>
        </article>)}
      </div> : <div className="empty-state"><Trophy size={32}/><b>No winner has been announced yet.</b><span>When an administrator closes a quiz and publishes its final result, the official announcement will appear here.</span></div>}

    {selected && <div className="modal-backdrop poster-backdrop" role="dialog" aria-modal="true" aria-label={`Winner poster preview for ${selected.winner.name}`}>
      <div className="poster-modal">
        <div className="poster-modal-header">
          <div><span className="section-kicker">POSTER PREVIEW</span><h2>{selected.winner.name} · {selected.challenge_title}</h2></div>
          <button className="modal-close" onClick={() => setPreviewId(null)} aria-label="Close poster preview"><X size={19}/></button>
        </div>
        {posterLoading && <div className="poster-loading" role="status">Preparing the high-resolution poster…</div>}
        <canvas ref={posterRef} className="winner-poster-canvas" width="1080" height="1350" aria-label="Generated 1080 by 1350 winner poster"/>
        <div className="poster-modal-actions">
          {isAdmin && <button className="text-button" onClick={regenerate} disabled={busy || posterLoading}><RefreshCw size={14}/> Regenerate Poster</button>}
          <button className="workspace-primary" onClick={() => download()} disabled={busy || posterLoading}><Download size={15}/>{busy ? 'Preparing…' : 'Download Poster'}</button>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {notice && <div className="workspace-notice" role="status">{notice}</div>}
      </div>
    </div>}
  </section>;
}
