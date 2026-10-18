import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Clock3, Code2, ExternalLink, Map, Maximize2, PlayCircle, Search, ShieldCheck, Sparkles, X } from 'lucide-react';

const foundations = [
  ['01', 'Programming basics', 'Variables, data types, conditions, loops and functions', '1–2 weeks'],
  ['02', 'Git & developer tools', 'Terminal basics, Git, GitHub, debugging and virtual environments', '3–5 days'],
  ['03', 'HTTP & web foundations', 'Client/server, requests, responses, JSON and status codes', '1 week'],
  ['04', 'SQL & databases', 'Tables, keys, relationships, CRUD and PostgreSQL basics', '1–2 weeks'],
  ['05', 'Your first API', 'Build, test and document a small REST API', '1 week'],
  ['06', 'Ship a mini-project', 'Authentication, tests, README and deployment', '1–2 weeks'],
];

function ReaderContent({ value }) {
  return value.split(/```/).map((block, index) => {
    if (index % 2) return <pre key={index}><code>{block.replace(/^[^\n]*\n/, '')}</code></pre>;
    return block.split(/\n{2,}/).filter(Boolean).map((paragraph, itemIndex) => {
      const heading = paragraph.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const Tag = `h${heading[1].length + 1}`;
        return <Tag key={`${index}-${itemIndex}`}>{heading[2]}</Tag>;
      }
      return <p key={`${index}-${itemIndex}`}>{paragraph.split('\n').map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>{line}{lineIndex < paragraph.split('\n').length - 1 && <br/>}</React.Fragment>
      ))}</p>;
    });
  });
}

export default function LearningHub({ api, token, onLogin }) {
  const [paths, setPaths] = useState([]);
  const [books, setBooks] = useState([]);
  const [progress, setProgress] = useState({});
  const [selectedPathId, setSelectedPathId] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('paths');
  const [expandedBookId, setExpandedBookId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const readingTimer = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [pathResponse, bookResponse] = await Promise.all([
          fetch(`${api}/api/learning/paths`),
          fetch(`${api}/api/learning/books`),
        ]);
        if (!pathResponse.ok || !bookResponse.ok) throw new Error('Could not load learning content. Please try again.');
        const [pathRows, bookRows] = await Promise.all([pathResponse.json(), bookResponse.json()]);
        let progressRows = [];
        if (token) {
          const progressResponse = await fetch(`${api}/api/learning/progress`, { headers: { Authorization: `Bearer ${token}` } });
          if (!progressResponse.ok && progressResponse.status !== 401) throw new Error('Could not load your learning progress.');
          if (progressResponse.ok) progressRows = await progressResponse.json();
        }
        if (cancelled) return;
        setPaths(pathRows);
        setBooks(bookRows);
        setProgress(Object.fromEntries(progressRows.map(row => [row.lesson_id, row])));
        setSelectedPathId(current => pathRows.some(path => path.id === current) ? current : pathRows[0]?.id ?? null);
        const lastRead = [...progressRows].filter(row => row.last_position > 0 || row.completed)
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
        if (lastRead) {
          setSelectedPathId(pathRows.find(path => path.lessons.some(lesson => lesson.id === lastRead.lesson_id))?.id ?? pathRows[0]?.id ?? null);
          setSelectedLessonId(current => current ?? lastRead.lesson_id);
        }
      } catch (cause) {
        if (!cancelled) setError(cause.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [api, token]);

  useEffect(() => () => window.clearTimeout(readingTimer.current), []);

  useEffect(() => {
    if (expandedBookId === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = event => {
      if (event.key === 'Escape') setExpandedBookId(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expandedBookId]);

  useEffect(() => {
    if (readerRef.current && selectedLessonId) {
      readerRef.current.scrollTop = progress[selectedLessonId]?.last_position || 0;
    }
  }, [selectedLessonId, progress]);

  const selectedPath = paths.find(path => path.id === selectedPathId) || null;
  const selectedLesson = selectedPath?.lessons.find(lesson => lesson.id === selectedLessonId) || null;
  const lessons = selectedPath?.lessons || [];
  const filteredPaths = useMemo(() => paths.filter(path =>
    `${path.title} ${path.description} ${path.language} ${path.framework}`.toLowerCase().includes(query.toLowerCase())
  ), [paths, query]);
  const filteredBooks = useMemo(() => books.filter(book =>
    `${book.title} ${book.author} ${book.technology} ${book.description}`.toLowerCase().includes(query.toLowerCase())
  ), [books, query]);
  const completeCount = lessons.filter(lesson => progress[lesson.id]?.completed).length;
  const resumeLesson = Object.values(progress).filter(item => item.last_position > 0 || item.completed)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];

  async function saveProgress(lessonId, completed, lastPosition = progress[lessonId]?.last_position || 0) {
    if (!token) {
      onLogin?.();
      setError('Log in to save your learning progress.');
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${api}/api/learning/progress/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completed, last_position: Math.max(0, Math.round(lastPosition)) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not save your progress.');
      setProgress(current => ({ ...current, [lessonId]: data }));
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function trackReading(event) {
    if (!token || !selectedLessonId) return;
    const position = event.currentTarget.scrollTop;
    const lessonId = selectedLessonId;
    const completed = Boolean(progress[lessonId]?.completed);
    window.clearTimeout(readingTimer.current);
    readingTimer.current = window.setTimeout(() => saveProgress(lessonId, completed, position), 700);
  }

  function openLesson(lesson) {
    setSelectedLessonId(lesson.id);
    setError('');
  }

  function moveLesson(direction) {
    const currentIndex = lessons.findIndex(lesson => lesson.id === selectedLessonId);
    const next = lessons[currentIndex + direction];
    if (next) openLesson(next);
  }

  return <div className="learning-hub">
    <section className="lh-hero">
      <div className="lh-hero-copy">
        <span className="lh-eyebrow"><Sparkles size={14}/> YOUR LEARNING LIBRARY</span>
        <h1>Learn by building<br/><span>real backend projects.</span></h1>
        <p>Follow published paths, study concise lessons, and learn from curated resources.</p>
        <div className="lh-hero-actions">
          <button onClick={() => { setSection('paths'); document.getElementById('lh-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Map size={16}/> Browse learning paths</button>
          <span><ShieldCheck size={15}/> Your progress is private</span>
        </div>
      </div>
      <div className="lh-hero-art"><div className="lh-code-card"><div><i/><i/><i/><span>api.py</span></div>
        <pre><b>from</b> fastapi <b>import</b> FastAPI{'\n\n'}app = FastAPI(){'\n\n'}<em>@app.get</em>(<strong>"/hello"</strong>){'\n'}<b>def</b> hello():{'\n'}    <b>return</b> {'{'}<strong>"ready"</strong>: True{'}'}</pre>
        <small>● Your journey starts here</small></div></div>
    </section>

    <div className="lh-toolbar" id="lh-content">
      <div><span className="lh-kicker">LEARNING LIBRARY</span><h2><BookOpen size={21}/> Paths and resources</h2></div>
      <label className="lh-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search paths, books, frameworks"/></label>
    </div>
    <div className="lh-tabs" role="tablist" aria-label="Learning library">
      <button role="tab" aria-selected={section === 'paths'} className={section === 'paths' ? 'selected' : ''} onClick={() => setSection('paths')}>Learning paths</button>
      <button role="tab" aria-selected={section === 'books'} className={section === 'books' ? 'selected' : ''} onClick={() => setSection('books')}>Books & resources ({books.length})</button>
    </div>
    {error && <div className="inline-error" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {loading ? <div className="empty-state">Loading published learning content…</div> : <>
      {section === 'paths' && <>
        {filteredPaths.length ? <div className="lh-path-grid">{filteredPaths.map(path => {
          const done = path.lessons.filter(lesson => progress[lesson.id]?.completed).length;
          const pct = path.lessons.length ? Math.round(done / path.lessons.length * 100) : 0;
          return <button key={path.id} className={`lh-path-card ${selectedPathId === path.id ? 'is-selected' : ''}`} onClick={() => { setSelectedPathId(path.id); setSelectedLessonId(null); }}>
            <div className="lh-card-top"><span className="lh-language-icon"><Code2 size={20}/></span><span className="lh-level">{path.difficulty}</span></div>
            <h3>{path.title}</h3><p>{path.description}</p><span className="lh-stack">{[path.language, path.framework].filter(Boolean).join(' · ')}</span>
            <div className="lh-progress"><span style={{ width: `${pct}%` }}/></div>
            <small>{done}/{path.lessons.length} lessons complete <ChevronRight size={15}/></small>
          </button>;
        })}</div> : <div className="empty-state">No published learning paths match. An administrator can publish paths from Manage.</div>}
        <section className="lh-roadmap"><div className="lh-section-head"><div><span className="lh-kicker">NEW TO BACKEND?</span><h2><Map size={21}/> Beginner roadmap</h2>
          <p>Follow the fundamentals before starting a language-specific course.</p></div><span className="lh-roadmap-badge">6 milestones</span></div>
          <div className="lh-roadmap-grid">{foundations.map(([number, title, detail, duration]) => <article className="lh-roadmap-step" key={number}>
            <div className="lh-step-num">{number}</div><div><h3>{title}</h3><p>{detail}</p><small><Clock3 size={13}/>{duration}</small></div>
          </article>)}</div>
        </section>
        {selectedPath && <section className="lh-lessons"><div className="lh-section-head"><div><span className="lh-kicker">SELECTED PATH</span><h2><Code2 size={21}/> {selectedPath.title}</h2><p>{selectedPath.description}</p></div>
          <span className="lh-completion">{completeCount}/{lessons.length} complete</span></div>
          {resumeLesson && <button className="workspace-primary lh-resume" onClick={() => {
            const path = paths.find(candidate => candidate.lessons.some(lesson => lesson.id === resumeLesson.lesson_id));
            if (path) setSelectedPathId(path.id);
            setSelectedLessonId(resumeLesson.lesson_id);
          }}><PlayCircle size={15}/> Resume your last lesson</button>}
          <div className="lh-curriculum-progress"><span style={{ width: `${lessons.length ? completeCount / lessons.length * 100 : 0}%` }}/></div>
          {lessons.length ? <div className="lh-lesson-list">{lessons.map((lesson, index) => {
            const done = Boolean(progress[lesson.id]?.completed);
            return <article className={`lh-lesson ${done ? 'lesson-done' : ''}`} key={lesson.id}>
              <div className="lh-lesson-icon">{done ? <CheckCircle2 size={20}/> : <span>{String(index + 1).padStart(2, '0')}</span>}</div>
              <div className="lh-lesson-copy"><h3>{lesson.title}</h3><p>{lesson.explanation || lesson.topic || lesson.module_title}</p>
                <small><BookOpen size={13}/>{lesson.module_title}{lesson.topic ? ` · ${lesson.topic}` : ''}</small></div>
              <button onClick={() => openLesson(lesson)}>{selectedLessonId === lesson.id ? 'Reading' : done ? 'Review lesson' : 'Read lesson'} <ChevronRight size={15}/></button>
            </article>;
          })}</div> : <p>No published lessons are available in this path yet.</p>}
          {selectedLesson && <article className="lh-note-view" key={selectedLesson.id}>
            <div className="lh-note-heading"><div><span className="lh-kicker">{selectedLesson.module_title}</span><h3>{selectedLesson.title}</h3></div>
              <button aria-label="Close lesson" onClick={() => setSelectedLessonId(null)}>×</button></div>
            <div ref={readerRef} className="lh-reader-content" onScroll={trackReading} tabIndex="0" aria-label={`${selectedLesson.title} lesson content`}>
              {selectedLesson.explanation && <p className="lesson-explanation">{selectedLesson.explanation}</p>}
              {selectedLesson.video_embed_url && <div className="lh-video">
                <iframe src={selectedLesson.video_embed_url} title={`${selectedLesson.title} video`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>
                <a href={selectedLesson.video_url} target="_blank" rel="noreferrer">Open this video on YouTube</a>
              </div>}
              <ReaderContent value={selectedLesson.content || 'This lesson does not have notes yet.'}/>
              {selectedLesson.objectives && <div className="lh-note-callout"><b>Learning objectives</b><span>{selectedLesson.objectives}</span></div>}
            </div>
            <div className="lh-note-actions"><button className="text-button" onClick={() => moveLesson(-1)} disabled={lessons.findIndex(lesson => lesson.id === selectedLesson.id) <= 0}>← Previous</button>
              <button onClick={() => saveProgress(selectedLesson.id, !progress[selectedLesson.id]?.completed)} disabled={saving}>
                <CheckCircle2 size={15}/>{saving ? 'Saving…' : progress[selectedLesson.id]?.completed ? 'Mark incomplete' : 'Mark complete'}
              </button>
              <button className="text-button" onClick={() => moveLesson(1)} disabled={lessons.findIndex(lesson => lesson.id === selectedLesson.id) >= lessons.length - 1}>Next →</button>
            </div>
            {!token && <p className="lh-login-hint">Log in to save completion and resume position.</p>}
          </article>}
        </section>}
      </>}
      {section === 'books' && (filteredBooks.length ? <div className="lh-book-grid">{filteredBooks.map(book =>
        <article className="lh-book-card" key={book.id}>
          {book.cover_url ? <img src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy"/> : <div className="lh-book-placeholder"><BookOpen size={26}/></div>}
          <div><span className="lh-level">{book.difficulty} · {book.format}</span><h3>{book.title}</h3><p>{book.author && <><b>{book.author}</b><br/></>}{book.description}</p>
            <small>{book.technology}</small>
            {book.preview_url && <div className={`lh-book-preview ${expandedBookId === book.id ? 'is-expanded' : ''}`}>
              <div className="lh-book-preview-toolbar">
                <span><BookOpen size={15}/>{book.title}</span>
                <button type="button" onClick={() => setExpandedBookId(current => current === book.id ? null : book.id)}
                  aria-label={expandedBookId === book.id ? 'Close full-screen book preview' : `Expand ${book.title} preview`}>
                  {expandedBookId === book.id ? <><X size={17}/> Close preview</> : <><Maximize2 size={16}/> Full-screen preview</>}
                </button>
              </div>
              <iframe title={`${book.title} preview`} src={book.preview_url} loading="lazy" referrerPolicy="no-referrer" allow="autoplay; fullscreen" allowFullScreen/>
            </div>}
            <a className="workspace-primary lh-open-resource" href={book.resource_url} target="_blank" rel="noreferrer">Read book <ExternalLink size={15}/></a>
            {book.reference_url && <a className="lh-reference-link" href={book.reference_url} target="_blank" rel="noreferrer">Reference / source <ExternalLink size={12}/></a>}
            {book.preview_url && <p className="lh-drive-note">If the embedded preview is blocked, open the Drive resource. Access follows the owner's sharing permissions.</p>}
          </div>
        </article>
      )}</div> : <div className="empty-state">No published books or resources match your search.</div>)}
    </>}
    <p className="lh-disclaimer">Learning resources are managed by the SigniAI team. External resource access follows the provider’s sharing permissions.</p>
  </div>;
}
