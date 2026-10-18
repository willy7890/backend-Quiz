import React, { useEffect, useState } from 'react';
import { Archive, ExternalLink, Instagram, Linkedin, Music2, Plus, RefreshCw, Save, Trash2, Youtube } from 'lucide-react';
import MultiPlatformVideoEmbed from './MultiPlatformVideoEmbed.jsx';
import { resolveVideoUrl } from './mediaProviders.js';

const categoryOptions = [
  'Python', 'JavaScript', 'FastAPI', 'Node.js', 'SQL', 'AI & Machine Learning',
  'Backend Concepts', 'Security', 'Developer Productivity',
];
const providerIcons = { youtube: Youtube, tiktok: Music2, instagram: Instagram, linkedin: Linkedin, direct: ExternalLink };

const blankMedia = () => ({
  kind: 'COURSE_VIDEO', title: '', description: '', caption: '', category: '',
  thumbnail_url: '', video_url: '', code_example: '', duration_seconds: 0, difficulty: 'BEGINNER',
  instructor: '', creator: '', notes: '', resources: '', tags: '', status: 'DRAFT',
});

function fromRecord(item) {
  return { ...item, resources: item.resources.join('\n'), tags: item.tags.join(', '), thumbnail_url: item.thumbnail_url || '' };
}

export default function LearningMediaAdmin({ api, token }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankMedia);
  const [editingId, setEditingId] = useState(null);
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewActive, setPreviewActive] = useState(false);
  const media = resolveVideoUrl(form.video_url);

  async function request(path, options = {}) {
    const response = await fetch(`${api}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const detail = Array.isArray(data?.detail) ? data.detail.map(item => item.msg).join('; ') : data?.detail;
      throw new Error(detail || 'Could not complete this content request.');
    }
    return data;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (kindFilter) params.set('kind', kindFilter);
      if (statusFilter) params.set('status', statusFilter);
      const query = params.toString();
      const records = await request(`/api/admin/learning-media${query ? `?${query}` : ''}`);
      setItems(records);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [api, token, kindFilter, statusFilter]);

  function edit(item) {
    setEditingId(item.id);
    setForm(fromRecord(item));
    setError('');
    setNotice('');
    setPreviewActive(false);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      video_url: media.normalizedUrl,
      thumbnail_url: form.thumbnail_url.trim() || null,
      duration_seconds: Number(form.duration_seconds),
      resources: form.resources.split('\n').map(value => value.trim()).filter(Boolean),
      tags: form.tags.split(',').map(value => value.trim()).filter(Boolean),
    };
    try {
      if (media.error) throw new Error(media.error);
      await request(editingId ? `/api/admin/learning-media/${editingId}` : '/api/admin/learning-media', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setNotice(editingId ? 'Learning media updated.' : 'Learning media created.');
      setEditingId(null);
      setForm(blankMedia());
      setPreviewActive(false);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(item, status) {
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/learning-media/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...item, thumbnail_url: item.thumbnail_url || null, status }),
      });
      setNotice(`Content ${status.toLowerCase()}.`);
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Permanently delete “${item.title}”?`)) return;
    setError('');
    try {
      await request(`/api/admin/learning-media/${item.id}`, { method: 'DELETE' });
      setNotice('Learning media deleted.');
      if (editingId === item.id) {
        setEditingId(null);
        setForm(blankMedia());
      }
      await load();
    } catch (cause) {
      setError(cause.message);
    }
  }

  function update(name, value) {
    setForm(current => ({ ...current, [name]: value }));
    if (name === 'video_url') setPreviewActive(false);
  }

  return <section className="lh-admin-media">
    <div className="section-heading"><div><span className="section-kicker">VIDEO LIBRARY</span><h2>Videos & SigniAI Shorts</h2></div>
      <button className="text-button" onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </div>
    <p className="admin-upload-note">Video uploads are not configured on this deployment. Add a public HTTPS video URL or a YouTube link; media binaries are never stored in PostgreSQL.</p>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    <div className="lh-admin-media-grid">
      <div className="lh-admin-media-list">
        <div className="admin-book-filters">
          <select aria-label="Filter media type" value={kindFilter} onChange={event => setKindFilter(event.target.value)}>
            <option value="">All media</option><option value="COURSE_VIDEO">Course videos</option><option value="SHORT">Short videos</option>
          </select>
          <select aria-label="Filter media status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option>
          </select>
        </div>
        <button className="workspace-primary" onClick={() => { setEditingId(null); setForm(blankMedia()); }}><Plus size={15}/> Add video</button>
        {loading ? <p role="status">Loading videos…</p> : <div className="admin-record-list">
          {items.map(item => <article key={item.id}>
            <div><b>{item.title}</b><small>{item.provider || 'External'} · {item.kind === 'SHORT' ? 'Short' : 'Course video'} · {item.category} · {item.status}</small></div>
            <div className="workspace-buttons">
              <button className="text-button" onClick={() => edit(item)}>Edit</button>
              {item.status === 'PUBLISHED' && <button className="text-button" onClick={() => changeStatus(item, 'DRAFT')}>Unpublish</button>}
              {item.status !== 'ARCHIVED' && <button className="text-button" onClick={() => changeStatus(item, 'ARCHIVED')} title="Archive"><Archive size={14}/></button>}
              <button className="text-button danger-text" onClick={() => remove(item)} aria-label={`Delete ${item.title}`}><Trash2 size={14}/></button>
            </div>
          </article>)}
          {!items.length && <p>No content matches these filters.</p>}
        </div>}
      </div>
      <form className="admin-editor-form" onSubmit={save}>
        <h3>{editingId ? 'Edit learning media' : 'Add learning media'}</h3>
        <label>Content type<select value={form.kind} onChange={event => update('kind', event.target.value)}><option value="COURSE_VIDEO">Course video</option><option value="SHORT">SigniAI short video</option></select></label>
        <label>Title<input required minLength="2" maxLength="200" value={form.title} onChange={event => update('title', event.target.value)}/></label>
        <label>Category<input required maxLength="120" list="learning-media-categories" value={form.category} onChange={event => update('category', event.target.value)} placeholder={form.kind === 'SHORT' ? 'Python Tips' : 'FastAPI'}/>
          <datalist id="learning-media-categories">{categoryOptions.map(option => <option key={option} value={option}/>)}</datalist></label>
        <label>Video URL<input required type="url" maxLength="2048" value={form.video_url} onChange={event => update('video_url', event.target.value)} placeholder="YouTube, TikTok, Instagram, LinkedIn, or direct MP4 URL"/><small>Use a supported public HTTPS post or direct MP4/WebM/OGG link. Platform privacy and embed settings remain controlled by the provider.</small></label>
        {form.video_url && <div className={`mve-provider-badge ${media.provider === 'unsupported' ? 'invalid' : ''}`}>
          {(() => { const Icon = providerIcons[media.provider] || ExternalLink; return <Icon size={16}/>; })()}
          <span>{media.label}</span>
          {media.provider !== 'unsupported' && <small>{media.embedUrl ? 'Official embed available for preview' : media.provider === 'direct' ? 'HTML video preview' : media.note || 'External link only'}</small>}
          {media.error && <small role="alert">{media.error}</small>}
        </div>}
        <label>Thumbnail URL<input type="url" maxLength="2048" value={form.thumbnail_url} onChange={event => update('thumbnail_url', event.target.value)} placeholder="https://…"/></label>
        <div className="admin-form-row"><label>Duration (seconds)<input type="number" min="0" max="86400" value={form.duration_seconds} onChange={event => update('duration_seconds', event.target.value)}/></label>
          <label>Difficulty<select value={form.difficulty} onChange={event => update('difficulty', event.target.value)}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label></div>
        <label>Description<textarea maxLength="10000" value={form.description} onChange={event => update('description', event.target.value)}/></label>
        {form.kind === 'SHORT' && <label>Caption<textarea maxLength="2000" value={form.caption} onChange={event => update('caption', event.target.value)}/></label>}
        <div className="admin-form-row"><label>Instructor<input maxLength="160" value={form.instructor} onChange={event => update('instructor', event.target.value)}/></label>
          <label>Creator<input maxLength="160" value={form.creator} onChange={event => update('creator', event.target.value)}/></label></div>
        <label>Notes<textarea maxLength="20000" value={form.notes} onChange={event => update('notes', event.target.value)}/></label>
        <label>Code example<textarea className="lesson-content-input" maxLength="100000" value={form.code_example || ''} onChange={event => update('code_example', event.target.value)}/></label>
        <label>Resource links (one HTTPS URL per line)<textarea value={form.resources} onChange={event => update('resources', event.target.value)}/></label>
        <label>Tags (comma separated)<input value={form.tags} onChange={event => update('tags', event.target.value)}/></label>
        <label>Publication status<select value={form.status} onChange={event => update('status', event.target.value)}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label>
        <div className="workspace-buttons">
          <button type="button" className="text-button" disabled={!!media.error || !form.video_url} onClick={() => setPreviewActive(value => !value)}>
            {previewActive ? 'Hide preview' : 'Preview video'}
          </button>
          {media.normalizedUrl && <a className="lh-media-link" href={media.normalizedUrl} target="_blank" rel="noreferrer">Open original <ExternalLink size={13}/></a>}
        </div>
        {previewActive && !media.error && <div className="lh-admin-inline-preview">
          <MultiPlatformVideoEmbed url={media.normalizedUrl} title={form.title || 'Admin video preview'} thumbnail={form.thumbnail_url} />
          <small>The preview uses the provider’s own embed. A loaded frame does not guarantee that a private, deleted, restricted, or login-gated video can play.</small>
        </div>}
        <div className="workspace-buttons"><button className="workspace-primary" disabled={busy}><Save size={15}/>{busy ? 'Saving…' : 'Save content'}</button>
          <button type="button" className="text-button" onClick={() => { setEditingId(null); setForm(blankMedia()); }}>Clear</button></div>
      </form>
    </div>
  </section>;
}
