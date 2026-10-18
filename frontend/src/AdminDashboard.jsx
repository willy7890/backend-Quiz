import React, { useEffect, useState } from 'react';
import { Archive, BookOpen, Check, Eye, FileText, Layers3, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, Users } from 'lucide-react';

const emptyPath = () => ({
  slug: '', title: '', description: '', language: '', framework: '', difficulty: 'BEGINNER',
  prerequisites: '', objectives: '', recommended_order: 0, status: 'DRAFT',
});
const emptyLesson = () => ({
  learning_path_id: '', module_title: '', topic: '', title: '', content: '', video_url: '', explanation: '',
  objectives: '', difficulty: 'BEGINNER', recommended_order: 0, status: 'DRAFT',
});
const emptyBook = () => ({
  title: '', author: '', description: '', technology: '', difficulty: 'BEGINNER',
  cover_url: '', format: 'LINK', resource_url: '', reference_url: '', status: 'DRAFT',
});
function drivePreviewUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)$/);
    return url.hostname === 'drive.google.com' && match
      ? `https://drive.google.com/file/d/${match[1]}/preview`
      : null;
  } catch {
    return null;
  }
}

function ContentPreview({ value }) {
  const blocks = value.split(/```/);
  return <div className="content-preview">
    {blocks.map((block, index) => {
      if (index % 2) return <pre key={index}><code>{block.replace(/^[^\n]*\n/, '')}</code></pre>;
      return block.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => {
        const heading = paragraph.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const Tag = `h${heading[1].length + 1}`;
          return <Tag key={`${index}-${paragraphIndex}`}>{heading[2]}</Tag>;
        }
        return <p key={`${index}-${paragraphIndex}`}>{paragraph.split('\n').map((line, lineIndex) => (
          <React.Fragment key={lineIndex}>{line}{lineIndex < paragraph.split('\n').length - 1 && <br/>}</React.Fragment>
        ))}</p>;
      });
    })}
  </div>;
}

export default function AdminDashboard({ api, token }) {
  const [section, setSection] = useState('overview');
  const [stats, setStats] = useState(null);
  const [paths, setPaths] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [books, setBooks] = useState([]);
  const [pathForm, setPathForm] = useState(emptyPath());
  const [lessonForm, setLessonForm] = useState(emptyLesson());
  const [bookForm, setBookForm] = useState(emptyBook());
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function request(route, options = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${api}${route}`, { ...options, headers: { ...headers, ...options.headers } });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join('; ') : data.detail;
      throw new Error(details || `Request failed (${response.status})`);
    }
    return data;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [dashboard, pathRows, lessonRows, bookRows] = await Promise.all([
        request('/api/admin/dashboard'),
        request('/api/admin/learning-paths'),
        request('/api/admin/lessons'),
        request(`/api/admin/books${search || statusFilter ? `?${new URLSearchParams({ ...(search ? { search } : {}), ...(statusFilter ? { status: statusFilter } : {}) })}` : ''}`),
      ]);
      setStats(dashboard);
      setPaths(pathRows);
      setLessons(lessonRows);
      setBooks(bookRows);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [api, token, search, statusFilter]);

  function resetEditor() {
    setEditing(null);
    setPreview(null);
    setPathForm(emptyPath());
    setLessonForm({ ...emptyLesson(), learning_path_id: paths[0]?.id || '' });
    setBookForm(emptyBook());
  }

  async function savePath(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...pathForm, recommended_order: Number(pathForm.recommended_order) };
      await request(editing?.type === 'path' ? `/api/admin/learning-paths/${editing.id}` : '/api/admin/learning-paths', {
        method: editing?.type === 'path' ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      setNotice(editing ? 'Learning path saved.' : 'Learning path created.');
      resetEditor();
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function saveLesson(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...lessonForm, learning_path_id: Number(lessonForm.learning_path_id), recommended_order: Number(lessonForm.recommended_order) };
      await request(editing?.type === 'lesson' ? `/api/admin/lessons/${editing.id}` : '/api/admin/lessons', {
        method: editing?.type === 'lesson' ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      setNotice(editing ? 'Lesson saved.' : 'Lesson created.');
      resetEditor();
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function saveBook(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...bookForm, cover_url: bookForm.cover_url || null, reference_url: bookForm.reference_url || null };
      await request(editing?.type === 'book' ? `/api/admin/books/${editing.id}` : '/api/admin/books', {
        method: editing?.type === 'book' ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      setNotice(editing ? 'Book saved.' : 'Book created.');
      resetEditor();
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  function editPath(path) {
    setSection('paths'); setEditing({ type: 'path', id: path.id }); setPathForm({
      slug: path.slug, title: path.title, description: path.description, language: path.language,
      framework: path.framework, difficulty: path.difficulty, prerequisites: path.prerequisites,
      objectives: path.objectives, recommended_order: path.recommended_order, status: path.status,
    }); setPreview(null);
  }

  function editLesson(lesson) {
    setSection('lessons'); setEditing({ type: 'lesson', id: lesson.id }); setLessonForm({
      learning_path_id: lesson.learning_path_id, module_title: lesson.module_title, topic: lesson.topic,
      title: lesson.title, content: lesson.content, video_url: lesson.video_url || '', explanation: lesson.explanation, objectives: lesson.objectives,
      difficulty: lesson.difficulty, recommended_order: lesson.recommended_order, status: lesson.status,
    }); setPreview(null);
  }

  function editBook(book) {
    setSection('books'); setEditing({ type: 'book', id: book.id }); setBookForm({
      title: book.title, author: book.author, description: book.description, technology: book.technology,
      difficulty: book.difficulty, cover_url: book.cover_url || '', format: book.format,
      resource_url: book.resource_url, reference_url: book.reference_url || '', status: book.status,
    }); setPreview(book);
  }

  async function deleteBook(book) {
    if (!window.confirm(`Permanently delete “${book.title}”?`)) return;
    setError(''); setNotice('');
    try { await request(`/api/admin/books/${book.id}`, { method: 'DELETE' }); setNotice('Book deleted.'); await load(); }
    catch (cause) { setError(cause.message); }
  }

  const sections = [
    ['overview', 'Overview', ShieldCheck],
    ['paths', 'Learning paths', Layers3],
    ['lessons', 'Lessons & notes', FileText],
    ['books', 'Books library', BookOpen],
  ];

  return <section className="admin-dashboard panel" aria-label="Admin dashboard">
    <div className="section-heading">
      <div><span className="section-kicker">SIGNIAI CONTENT MANAGEMENT</span><h2><ShieldCheck size={22}/> Admin dashboard</h2></div>
      <button className="text-button" onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </div>
    <nav className="admin-tabs" aria-label="Admin sections">
      {sections.map(([key, label, Icon]) => <button type="button" key={key} className={section === key ? 'selected' : ''} onClick={() => { setSection(key); resetEditor(); }}>
        <Icon size={15}/>{label}
      </button>)}
    </nav>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {notice && <div className="workspace-notice" role="status">{notice}</div>}
    {loading && <p role="status">Loading dashboard data…</p>}

    {section === 'overview' && stats && <div className="admin-overview">
      <div className="admin-stat-grid">
        {[['Registered users', stats.users, Users], ['Published paths', stats.learning_paths, Layers3],
          ['Lessons & notes', `${stats.published_lessons}/${stats.lessons}`, FileText],
          ['Books & resources', `${stats.published_books}/${stats.books}`, BookOpen],
          ['Published quizzes', stats.quizzes, Check], ['Projects & tasks', stats.projects, Archive]].map(([label, value, Icon]) =>
          <article className="admin-stat" key={label}><Icon size={19}/><span>{label}</span><b>{value}</b></article>)}
      </div>
      <h3>Recent content activity</h3>
      {stats.recent_content.length ? <ul className="admin-activity">{stats.recent_content.map((item, index) =>
        <li key={`${item.type}-${item.title}-${index}`}><span><b>{item.title}</b><small>{item.type} · {item.status}</small></span>
          <time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleString()}</time></li>)}</ul> : <p>No content activity yet.</p>}
    </div>}

    {section === 'paths' && <div className="admin-content-grid">
      <div><h3>Learning paths</h3>
        <button className="workspace-primary" onClick={() => { resetEditor(); setEditing(null); }}><Plus size={15}/> New path</button>
        <div className="admin-record-list">{paths.map(path => <article key={path.id}>
          <div><b>{path.title}</b><small>{path.language}{path.framework ? ` · ${path.framework}` : ''} · {path.status} · {path.lesson_count} published lessons</small></div>
          <button className="text-button" onClick={() => editPath(path)}>Edit</button>
        </article>)}</div>
      </div>
      <form className="admin-editor-form" onSubmit={savePath}>
        <h3>{editing?.type === 'path' ? 'Edit learning path' : 'Create learning path'}</h3>
        <label>Path slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={pathForm.slug} onChange={e => setPathForm({ ...pathForm, slug: e.target.value })} placeholder="python-backend"/></label>
        <label>Title<input required minLength="2" maxLength="200" value={pathForm.title} onChange={e => setPathForm({ ...pathForm, title: e.target.value })}/></label>
        <label>Description<textarea maxLength="10000" value={pathForm.description} onChange={e => setPathForm({ ...pathForm, description: e.target.value })}/></label>
        <div className="admin-form-row"><label>Language<input maxLength="80" value={pathForm.language} onChange={e => setPathForm({ ...pathForm, language: e.target.value })}/></label><label>Framework<input maxLength="100" value={pathForm.framework} onChange={e => setPathForm({ ...pathForm, framework: e.target.value })}/></label></div>
        <div className="admin-form-row"><label>Difficulty<select value={pathForm.difficulty} onChange={e => setPathForm({ ...pathForm, difficulty: e.target.value })}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label><label>Status<select value={pathForm.status} onChange={e => setPathForm({ ...pathForm, status: e.target.value })}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label></div>
        <label>Prerequisites<textarea value={pathForm.prerequisites} onChange={e => setPathForm({ ...pathForm, prerequisites: e.target.value })}/></label>
        <label>Learning objectives<textarea value={pathForm.objectives} onChange={e => setPathForm({ ...pathForm, objectives: e.target.value })}/></label>
        <label>Recommended order<input type="number" min="0" max="10000" value={pathForm.recommended_order} onChange={e => setPathForm({ ...pathForm, recommended_order: e.target.value })}/></label>
        <div className="workspace-buttons"><button className="workspace-primary" disabled={busy}><Save size={15}/>{busy ? 'Saving…' : 'Save path'}</button><button type="button" className="text-button" onClick={resetEditor}>Clear</button></div>
      </form>
    </div>}

    {section === 'lessons' && <div className="admin-content-grid">
      <div><h3>Lessons and notes</h3>
        <button className="workspace-primary" onClick={() => { resetEditor(); setSection('lessons'); }} disabled={!paths.length}><Plus size={15}/> New lesson</button>
        {!paths.length && <p>Create a learning path before adding lessons.</p>}
        <div className="admin-record-list">{lessons.map(lesson => <article key={lesson.id}>
          <div><b>{lesson.title}</b><small>{paths.find(path => path.id === lesson.learning_path_id)?.title || 'Path'} · {lesson.module_title} · {lesson.status}</small></div>
          <button className="text-button" onClick={() => editLesson(lesson)}>Edit</button>
        </article>)}</div>
      </div>
      <form className="admin-editor-form" onSubmit={saveLesson}>
        <h3>{editing?.type === 'lesson' ? 'Edit lesson' : 'Create lesson / note'}</h3>
        <label>Learning path<select required value={lessonForm.learning_path_id} onChange={e => setLessonForm({ ...lessonForm, learning_path_id: e.target.value })}><option value="">Select a path</option>{paths.map(path => <option key={path.id} value={path.id}>{path.title}</option>)}</select></label>
        <div className="admin-form-row"><label>Module<input required maxLength="160" value={lessonForm.module_title} onChange={e => setLessonForm({ ...lessonForm, module_title: e.target.value })}/></label><label>Topic<input maxLength="160" value={lessonForm.topic} onChange={e => setLessonForm({ ...lessonForm, topic: e.target.value })}/></label></div>
        <label>Lesson title<input required minLength="2" maxLength="200" value={lessonForm.title} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })}/></label>
        <label>Lesson notes (plain text with Markdown headings and fenced code)<textarea className="lesson-content-input" maxLength="100000" value={lessonForm.content} onChange={e => setLessonForm({ ...lessonForm, content: e.target.value })}/></label>
        <label>YouTube video URL (optional)<input type="url" maxLength="2048" value={lessonForm.video_url} onChange={e => setLessonForm({ ...lessonForm, video_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…"/><small>Published lessons embed the video and include a direct YouTube link.</small></label>
        <label>Explanation<textarea maxLength="10000" value={lessonForm.explanation} onChange={e => setLessonForm({ ...lessonForm, explanation: e.target.value })}/></label>
        <label>Learning objectives<textarea maxLength="5000" value={lessonForm.objectives} onChange={e => setLessonForm({ ...lessonForm, objectives: e.target.value })}/></label>
        <div className="admin-form-row"><label>Difficulty<select value={lessonForm.difficulty} onChange={e => setLessonForm({ ...lessonForm, difficulty: e.target.value })}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label><label>Status<select value={lessonForm.status} onChange={e => setLessonForm({ ...lessonForm, status: e.target.value })}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label></div>
        <label>Recommended order<input type="number" min="0" max="10000" value={lessonForm.recommended_order} onChange={e => setLessonForm({ ...lessonForm, recommended_order: e.target.value })}/></label>
        <div className="workspace-buttons"><button type="button" className="text-button" onClick={() => setPreview({ type: 'lesson', title: lessonForm.title, content: lessonForm.content })}><Eye size={14}/> Preview notes</button><button className="workspace-primary" disabled={busy || !paths.length}><Save size={15}/>{busy ? 'Saving…' : 'Save lesson'}</button><button type="button" className="text-button" onClick={resetEditor}>Clear</button></div>
        {preview?.type === 'lesson' && <div className="admin-preview"><h4>{preview.title || 'Lesson preview'}</h4><ContentPreview value={preview.content}/></div>}
      </form>
    </div>}

    {section === 'books' && <div className="admin-content-grid">
      <div><h3>Books and resources</h3>
        <div className="admin-book-filters"><label className="lh-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, author, language"/></label>
          <select aria-label="Filter books by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></div>
        <button className="workspace-primary" onClick={() => { resetEditor(); setSection('books'); }}><Plus size={15}/> Add book</button>
        <div className="admin-record-list">{books.map(book => <article key={book.id}>
          <div>{book.cover_url && <img className="admin-book-cover" src={book.cover_url} alt=""/>}<b>{book.title}</b><small>{book.author || 'Unknown author'} · {book.technology || 'General'} · {book.status}</small></div>
          <div className="workspace-buttons"><button className="text-button" onClick={() => editBook(book)}>Edit / preview</button><button className="text-button danger-text" onClick={() => deleteBook(book)} aria-label={`Delete ${book.title}`}><Trash2 size={14}/></button></div>
        </article>)}</div>
      </div>
      <form className="admin-editor-form" onSubmit={saveBook}>
        <h3>{editing?.type === 'book' ? 'Edit book or resource' : 'Add book or resource'}</h3>
        <label>Title<input required minLength="2" maxLength="200" value={bookForm.title} onChange={e => setBookForm({ ...bookForm, title: e.target.value })}/></label>
        <label>Author<input maxLength="160" value={bookForm.author} onChange={e => setBookForm({ ...bookForm, author: e.target.value })}/></label>
        <label>Description<textarea maxLength="10000" value={bookForm.description} onChange={e => setBookForm({ ...bookForm, description: e.target.value })}/></label>
        <label>Language or framework<input maxLength="120" value={bookForm.technology} onChange={e => setBookForm({ ...bookForm, technology: e.target.value })}/></label>
        <div className="admin-form-row"><label>Difficulty<select value={bookForm.difficulty} onChange={e => setBookForm({ ...bookForm, difficulty: e.target.value })}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label><label>Format<select value={bookForm.format} onChange={e => setBookForm({ ...bookForm, format: e.target.value })}><option>LINK</option><option>PDF</option><option>EPUB</option><option>VIDEO</option><option>OTHER</option></select></label></div>
        <label>Cover image URL<input type="url" maxLength="2048" value={bookForm.cover_url} onChange={e => setBookForm({ ...bookForm, cover_url: e.target.value })} placeholder="https://…"/></label>
        <label>Google Drive URL or resource URL<input required type="url" maxLength="2048" value={bookForm.resource_url} onChange={e => setBookForm({ ...bookForm, resource_url: e.target.value })} placeholder="https://drive.google.com/…"/></label>
        <label>Reference / source URL<input type="url" maxLength="2048" value={bookForm.reference_url} onChange={e => setBookForm({ ...bookForm, reference_url: e.target.value })} placeholder="https://…"/></label>
        <label>Publication status<select value={bookForm.status} onChange={e => setBookForm({ ...bookForm, status: e.target.value })}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label>
        {preview?.type !== 'lesson' && preview?.preview_url && <div className="book-preview"><h4>Drive preview</h4><iframe title={`${bookForm.title || preview.title} preview`} src={preview.preview_url} loading="lazy" referrerPolicy="no-referrer" allow="autoplay"/><p>Drive access is controlled by the file owner. If the preview is unavailable, open the resource directly.</p></div>}
        <div className="workspace-buttons"><button type="button" className="text-button" onClick={() => setPreview({ type: 'book', ...bookForm, preview_url: drivePreviewUrl(bookForm.resource_url) })}><Eye size={14}/> Preview</button><button className="workspace-primary" disabled={busy}><Save size={15}/>{busy ? 'Saving…' : 'Save book'}</button><button type="button" className="text-button" onClick={resetEditor}>Clear</button></div>
        {preview?.type === 'book' && <div className="admin-preview"><b>{bookForm.title || 'Book preview'}</b><p>{bookForm.description}</p>{bookForm.resource_url && <a href={bookForm.resource_url} target="_blank" rel="noreferrer">Open resource</a>}</div>}
        <p className="admin-upload-note">Files are not uploaded or stored by this app. Use a persistent public resource URL; configure cloud storage before offering uploads.</p>
      </form>
    </div>}
  </section>;
}
