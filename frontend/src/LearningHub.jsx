import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Code2,
  ExternalLink, Play, Search, ShieldCheck, Volume2,
  VolumeX,
} from 'lucide-react';
import MultiPlatformVideoEmbed, { FullscreenPreview } from './MultiPlatformVideoEmbed.jsx';
import { resolveVideoUrl } from './mediaProviders.js';
import './LearningHub.css';

const sections = [
  ['courses', 'Full Courses'],
  ['videos', 'Course Videos'],
  ['shorts', 'SigniAI Short Videos'],
  ['paths', 'Learning Paths'],
  ['books', 'Books & Resources'],
];

const courseCategories = [
  'Python Backend', 'JavaScript Backend', 'TypeScript & NestJS',
  'Java & Spring Boot', 'PHP & Laravel', 'Go Backend', 'Databases',
  'API Development', 'Security', 'DevOps', 'AI Engineering',
];
const videoCategories = [
  'Python', 'JavaScript', 'TypeScript', 'FastAPI', 'Node.js', 'NestJS',
  'Java', 'SQL', 'System Design', 'DevOps', 'AI & Machine Learning',
];
const shortCategories = [
  'Python Tips', 'JavaScript Tips', 'FastAPI Tips', 'Git & GitHub', 'SQL',
  'Backend Concepts', 'Security', 'AI & Machine Learning',
  'Developer Productivity', 'SigniAI Updates',
];

function readRoute() {
  const path = window.location.hash.replace(/^#\/?/, '');
  const match = path.match(/^learning\/(courses|course-videos)\/(\d+)$/);
  if (match) return { type: match[1] === 'courses' ? 'course' : 'video', id: Number(match[2]) };
  const bookMatch = path.match(/^learning\/books\/(\d+)$/);
  if (bookMatch) return { type: 'book', id: Number(bookMatch[1]) };
  if (path === 'learning/shorts') return { type: 'shorts' };
  return { type: 'library' };
}

async function getJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('We could not reach the learning library. Check your connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status >= 500
      ? 'Learning content is temporarily unavailable. Please try again.'
      : data?.detail || 'We could not load this learning content.');
  }
  return data;
}

function ReaderContent({ value = '' }) {
  return String(value).split(/```/).map((block, index) => {
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
  });
}

function duration(minutes, seconds = false) {
  const total = seconds ? Number(minutes || 0) : Number(minutes || 0) * 60;
  if (!total) return 'Self-paced';
  const hours = Math.floor(total / 3600);
  const mins = Math.round((total % 3600) / 60);
  return hours ? `${hours}h ${mins ? `${mins}m` : ''}`.trim() : `${mins} min`;
}

function Thumbnail({ item, icon: Icon = BookOpen }) {
  return <div className="lh-thumbnail">
    {item.thumbnail_url
      ? <img src={item.thumbnail_url} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }}/>
      : <span><Icon size={28}/></span>}
    <small>{item.category || item.language || item.technology || 'Learning'}</small>
  </div>;
}

export default function LearningHub({ api, token, onLogin }) {
  const [route, setRoute] = useState(readRoute);
  const [section, setSection] = useState('courses');
  const [courses, setCourses] = useState([]);
  const [paths, setPaths] = useState([]);
  const [books, setBooks] = useState([]);
  const [videos, setVideos] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [progress, setProgress] = useState({});
  const [totals, setTotals] = useState({ videos: 0, shorts: 0 });
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [activeShort, setActiveShort] = useState(0);
  const [shortCategory, setShortCategory] = useState('');
  const [muted, setMuted] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProgress, setSavingProgress] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cardRefs = useRef([]);
  const loadGuard = useRef(false);

  useEffect(() => {
    const updateRoute = () => {
      const next = readRoute();
      setRoute(next);
      if (next.type === 'shorts') setSection('shorts');
      if (next.type === 'video') setSection('videos');
      if (next.type === 'course') setSection('courses');
      if (next.type === 'book') setSection('books');
    };
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      setLoading(true);
      setError('');
      const requests = await Promise.allSettled([
        getJson(`${api}/api/learning/courses`),
        getJson(`${api}/api/learning/paths`),
        getJson(`${api}/api/learning/books`),
        getJson(`${api}/api/learning/course-videos?page=1&limit=24`),
        getJson(`${api}/api/learning/shorts?page=1&limit=8`),
        token ? getJson(`${api}/api/learning/progress`, { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const [courseRows, pathRows, bookRows, videoPage, shortPage, progressRows] = requests;
      const failures = requests.filter(request => request.status === 'rejected');
      if (courseRows.status === 'fulfilled') setCourses(courseRows.value);
      if (pathRows.status === 'fulfilled') setPaths(pathRows.value);
      if (bookRows.status === 'fulfilled') setBooks(bookRows.value);
      if (videoPage.status === 'fulfilled') {
        setVideos(videoPage.value.items);
        setTotals(current => ({ ...current, videos: videoPage.value.total }));
        setVideoPage(1);
      }
      if (shortPage.status === 'fulfilled') {
        setShorts(shortPage.value.items);
        setTotals(current => ({ ...current, shorts: shortPage.value.total }));
        setPage(1);
      }
      if (progressRows.status === 'fulfilled') {
        setProgress(Object.fromEntries(progressRows.value.map(row => [row.lesson_id, row])));
      } else if (token && progressRows.reason?.message?.includes('temporarily unavailable')) {
        setError('Your saved progress could not be loaded. You can still browse learning content.');
      }
      if (failures.length) setError(failures[0].reason.message);
      setLoading(false);
    }
    loadLibrary();
    return () => { cancelled = true; };
  }, [api, token, reloadKey]);

  useEffect(() => {
    if (route.type !== 'library' || section !== 'videos') return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingVideos(true);
      const params = new URLSearchParams({ page: '1', limit: '24' });
      if (query.trim()) params.set('search', query.trim());
      if (category) params.set('category', category);
      try {
        const result = await getJson(`${api}/api/learning/course-videos?${params}`);
        if (cancelled) return;
        setVideos(result.items);
        setTotals(current => ({ ...current, videos: result.total }));
        setVideoPage(1);
      } catch (cause) {
        if (!cancelled) setError(cause.message);
      } finally {
        if (!cancelled) setLoadingVideos(false);
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, route.type, section, query, category]);

  useEffect(() => {
    if (route.type === 'course' && !loading && !courses.some(item => item.id === route.id)) {
      getJson(`${api}/api/learning/courses/${route.id}`)
        .then(item => setCourses(current => current.some(existing => existing.id === item.id) ? current : [...current, item]))
        .catch(cause => setError(cause.message));
    }
    if (route.type === 'video' && !loading && !videos.some(item => item.id === route.id)) {
      getJson(`${api}/api/learning/course-videos/${route.id}`)
        .then(item => setVideos(current => current.some(existing => existing.id === item.id) ? current : [...current, item]))
        .catch(cause => setError(cause.message));
    }
  }, [api, route, loading, courses, videos]);

  useEffect(() => {
    if (route.type !== 'course') return;
    const course = courses.find(item => item.id === route.id);
    if (course && !course.lessons.some(item => item.id === activeLessonId)) {
      setActiveLessonId(course.lessons[0]?.id ?? null);
    }
  }, [route, courses, activeLessonId]);

  const course = courses.find(item => item.id === route.id);
  const selectedLesson = course?.lessons.find(item => item.id === activeLessonId) || course?.lessons[0] || null;
  const video = videos.find(item => item.id === route.id);
  const book = books.find(item => item.id === route.id);
  const activeShortProvider = shorts[activeShort]
    ? resolveVideoUrl(shorts[activeShort].video_url).provider
    : 'direct';
  const canControlShortMute = ['direct', 'youtube', 'tiktok'].includes(activeShortProvider);

  const visibleCourses = useMemo(() => courses.filter(item => (
    (!category || item.category === category)
    && `${item.title} ${item.description} ${item.category} ${item.framework}`.toLowerCase().includes(query.toLowerCase())
  )), [courses, category, query]);
  const visibleVideos = useMemo(() => videos.filter(item => (
    (!category || item.category === category)
    && `${item.title} ${item.description} ${item.category} ${item.instructor}`.toLowerCase().includes(query.toLowerCase())
  )), [videos, category, query]);
  const visiblePaths = useMemo(() => paths.filter(item => (
    `${item.title} ${item.description} ${item.framework} ${item.language}`.toLowerCase().includes(query.toLowerCase())
  )), [paths, query]);
  const visibleBooks = useMemo(() => books.filter(item => (
    `${item.title} ${item.description} ${item.author} ${item.technology}`.toLowerCase().includes(query.toLowerCase())
  )), [books, query]);

  useEffect(() => {
    if (route.type !== 'shorts' || !shorts.length) return undefined;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          const index = Number(entry.target.dataset.index);
          setActiveShort(index);
        }
      }
    }, { threshold: [0.65] });
    cardRefs.current.forEach(node => node && observer.observe(node));
    return () => observer.disconnect();
  }, [route.type, shorts.length]);

  useEffect(() => {
    if (route.type !== 'shorts') return;
    let cancelled = false;
    setLoadingMore(true);
    setShorts([]);
    setTotals(current => ({ ...current, shorts: 0 }));
    setActiveShort(0);
    const params = new URLSearchParams({ page: '1', limit: '8' });
    if (shortCategory) params.set('category', shortCategory);
    getJson(`${api}/api/learning/shorts?${params}`)
      .then(result => {
        if (cancelled) return;
        setShorts(result.items);
        setTotals(current => ({ ...current, shorts: result.total }));
        setPage(1);
        setActiveShort(0);
        cardRefs.current = [];
      })
      .catch(cause => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoadingMore(false); });
    return () => { cancelled = true; };
  }, [api, route.type, shortCategory]);

  useEffect(() => {
    if (route.type !== 'shorts' || activeShort < shorts.length - 2 || shorts.length >= totals.shorts) return;
    const nextPage = page + 1;
    if (loadGuard.current) return;
    loadGuard.current = true;
    setLoadingMore(true);
    getJson(`${api}/api/learning/shorts?${shortCategory ? `category=${encodeURIComponent(shortCategory)}&` : ''}page=${nextPage}&limit=8`)
      .then(result => {
        setShorts(current => [...current, ...result.items]);
        setPage(nextPage);
      })
      .catch(cause => setError(cause.message))
      .finally(() => { loadGuard.current = false; setLoadingMore(false); });
  }, [api, route.type, activeShort, shorts.length, totals.shorts, page, shortCategory]);

  function openWorkspace(path) {
    window.location.hash = path;
  }

  function backToLibrary(sectionName) {
    setSection(sectionName || section);
    window.location.hash = 'learning';
  }

  async function markComplete(lesson) {
    if (!token) {
      onLogin?.();
      setError('Log in to save your course progress.');
      return;
    }
    setSavingProgress(true);
    setError('');
    try {
      const response = await getJson(`${api}/api/learning/progress/${lesson.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: !progress[lesson.id]?.completed,
          last_position: progress[lesson.id]?.last_position || 0,
        }),
      });
      setProgress(current => ({ ...current, [lesson.id]: response }));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSavingProgress(false);
    }
  }

  async function loadMoreVideos() {
    if (loadingVideos || videos.length >= totals.videos) return;
    setLoadingVideos(true);
    const params = new URLSearchParams({ page: String(videoPage + 1), limit: '24' });
    if (query.trim()) params.set('search', query.trim());
    if (category) params.set('category', category);
    try {
      const result = await getJson(`${api}/api/learning/course-videos?${params}`);
      setVideos(current => [...current, ...result.items]);
      setVideoPage(result.page);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoadingVideos(false);
    }
  }

  function renderLibrary() {
    const categoryChoices = section === 'courses' ? courseCategories
      : section === 'videos' ? videoCategories : section === 'shorts' ? shortCategories : [];
    const cards = section === 'courses' ? visibleCourses : section === 'videos' ? visibleVideos
      : section === 'paths' ? visiblePaths : visibleBooks;
    return <>
      <header className="lh-library-hero">
        <div><span className="lh-eyebrow"><ShieldCheck size={14}/> SIGNIAI LEARNING</span>
          <h1>Build skills for what’s next.</h1>
          <p>Focused courses, curated video lessons, learning paths, and trusted resources.</p>
        </div>
        <div className="lh-library-stat"><BookOpen size={18}/><span><b>{courses.length + paths.length + books.length + videos.length + totals.shorts}</b> learning resources</span></div>
      </header>
      <nav className="lh-section-tabs" aria-label="Learning library sections">
        {sections.map(([key, label]) => <button key={key} className={section === key ? 'selected' : ''}
          onClick={() => {
            if (key === 'shorts') {
              openWorkspace('#/learning/shorts');
              return;
            }
            setSection(key);
            setCategory('');
            setQuery('');
          }}>{label}</button>)}
      </nav>
      <div className="lh-library-toolbar">
        <div><span className="lh-kicker">EXPLORE</span><h2>{sections.find(([key]) => key === section)?.[1]}</h2></div>
        <label className="lh-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search by title, topic, creator"/></label>
      </div>
      {categoryChoices.length > 0 && <div className="lh-category-list" aria-label="Filter by category">
        <button className={!category ? 'active' : ''} onClick={() => setCategory('')}>All topics</button>
        {categoryChoices.map(item => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>}
      {error && <div className="inline-error" role="alert">{error}<button className="text-button" onClick={() => { setError(''); setReloadKey(value => value + 1); }}>Retry</button></div>}
      {loading ? <div className="lh-state" role="status"><span className="lh-spinner"/>Loading your learning library…</div>
        : <section className="lh-catalog-grid">
          {section === 'videos' && loadingVideos && <div className="lh-catalog-loading" role="status">Updating video results…</div>}
          {cards.map(item => {
            const isCourse = section === 'courses';
            const isVideo = section === 'videos';
            const destination = isCourse || section === 'paths'
              ? `#/learning/courses/${item.id}`
              : isVideo ? `#/learning/course-videos/${item.id}` : `#/learning/books/${item.id}`;
            return <button className="lh-catalog-card" key={item.id} onClick={() => openWorkspace(destination)}>
              <Thumbnail item={item} icon={isVideo ? Play : BookOpen}/>
              <span className="lh-card-meta">{item.difficulty || 'ALL LEVELS'}<span>{duration(isCourse ? item.duration_minutes : item.duration_seconds, isVideo)}</span></span>
              <h3>{item.title}</h3><p>{item.description || item.framework || item.technology || 'Explore curated learning content.'}</p>
              <span className="lh-card-footer">{isCourse ? `${item.lesson_count} lessons · ${item.instructor || 'SigniAI'}` : isVideo ? `${item.instructor || 'SigniAI'} · ${duration(item.duration_seconds, true)}` : item.author || item.language || 'Curated resource'}<ArrowRight size={15}/></span>
            </button>;
          })}
          {!cards.length && !(section === 'shorts') && <div className="lh-state lh-empty">
            <BookOpen size={25}/><b>No matching {sections.find(([key]) => key === section)?.[1].toLowerCase()} yet.</b>
            <span>{query || category ? 'Try another search or topic.' : 'New learning content will appear here as it is published.'}</span>
          </div>}
        </section>}
      {section === 'videos' && !loading && videos.length < totals.videos && <button className="lh-load-more" onClick={loadMoreVideos} disabled={loadingVideos}>
        {loadingVideos ? 'Loading…' : 'Load more videos'} <ArrowRight size={15}/>
      </button>}
      {section === 'shorts' && !loading && !totals.shorts && <p className="lh-short-empty">Short videos are being prepared. Browse a course or learning path in the meantime.</p>}
      <p className="lh-library-footnote">Course notes and progress are saved to your account. External video and resource access follows the provider’s permissions.</p>
    </>;
  }

  function renderCourseWorkspace() {
    if (!course) return <div className="lh-state"><BookOpen size={25}/><b>Course unavailable</b><span>This course may have been unpublished.</span>
      <button className="text-button" onClick={() => backToLibrary('courses')}><ArrowLeft size={15}/> Back to courses</button></div>;
    const modules = [...new Set(course.lessons.map(item => item.module_title))];
    const completed = course.lessons.filter(item => progress[item.id]?.completed).length;
    return <div className="lh-workspace">
      <button className="lh-back-link" onClick={() => backToLibrary('courses')}><ArrowLeft size={16}/> All courses</button>
      <div className="lh-course-heading"><div><span className="lh-kicker">{course.category} · {course.difficulty}</span>
        <h1>{course.title}</h1><p>{course.description}</p><small>{course.instructor || 'SigniAI'} · {duration(course.duration_minutes)} · {completed}/{course.lessons.length} lessons complete</small>
      </div>{course.thumbnail_url && <img src={course.thumbnail_url} alt="" />}</div>
      <div className="lh-course-workspace">
        <aside className="lh-curriculum"><div className="lh-curriculum-title"><b>Course curriculum</b><span>{completed}/{course.lessons.length}</span></div>
          <div className="lh-course-progress"><span style={{ width: `${course.lessons.length ? completed / course.lessons.length * 100 : 0}%` }}/></div>
          {modules.map(module => <section key={module}><span className="lh-module-heading">{module}</span>
            {course.lessons.filter(item => item.module_title === module).map((item, index) => <button key={item.id}
              className={selectedLesson?.id === item.id ? 'active' : ''} onClick={() => setActiveLessonId(item.id)}>
              <span>{progress[item.id]?.completed ? <CheckCircle2 size={15}/> : String(index + 1).padStart(2, '0')}</span>{item.title}
            </button>)}
          </section>)}
        </aside>
        <article className="lh-lesson-workspace">
          {selectedLesson ? <>
            <div className="lh-lesson-top"><span>{selectedLesson.module_title} · {selectedLesson.difficulty}</span><h2>{selectedLesson.title}</h2>
              <p>{selectedLesson.explanation || selectedLesson.topic}</p></div>
            {selectedLesson.video_url && <MultiPlatformVideoEmbed url={selectedLesson.video_url} title={`${selectedLesson.title} video`}/>}
            <div className="lh-lesson-notes"><ReaderContent value={selectedLesson.content || 'Notes for this lesson are being prepared.'}/></div>
            {selectedLesson.code_example && <section className="lh-code-example"><h3>Code example</h3><pre><code>{selectedLesson.code_example}</code></pre></section>}
            {selectedLesson.resources?.length > 0 && <section className="lh-video-resources"><h2>Lesson resources</h2>
              {selectedLesson.resources.map(resource => <a key={resource} href={resource} target="_blank" rel="noreferrer">{resource}<ExternalLink size={13}/></a>)}
            </section>}
            {selectedLesson.objectives && <div className="lh-objectives"><b>What you’ll learn</b><p>{selectedLesson.objectives}</p></div>}
            <div className="lh-workspace-actions">
              <button className="text-button" disabled={course.lessons.findIndex(item => item.id === selectedLesson.id) === 0}
                onClick={() => setActiveLessonId(course.lessons[course.lessons.findIndex(item => item.id === selectedLesson.id) - 1]?.id)}>← Previous</button>
              <button className="workspace-primary" onClick={() => markComplete(selectedLesson)} disabled={savingProgress}>
                {progress[selectedLesson.id]?.completed ? <CheckCircle2 size={16}/> : <Check size={16}/>}
                {savingProgress ? 'Saving…' : progress[selectedLesson.id]?.completed ? 'Completed' : 'Mark complete'}
              </button>
              <button className="text-button" disabled={course.lessons.findIndex(item => item.id === selectedLesson.id) >= course.lessons.length - 1}
                onClick={() => setActiveLessonId(course.lessons[course.lessons.findIndex(item => item.id === selectedLesson.id) + 1]?.id)}>Next →</button>
            </div>
          </> : <div className="lh-state"><BookOpen size={26}/><b>Course curriculum coming soon</b><span>The instructor has not published lessons yet.</span></div>}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {!token && <p className="lh-login-hint">Log in to save your progress. <button className="text-button" onClick={onLogin}>Sign in</button></p>}
        </article>
      </div>
    </div>;
  }

  function renderVideoWorkspace() {
    if (!video) return <div className="lh-state"><Play size={25}/><b>Video unavailable</b><span>This video may have been unpublished.</span>
      <button className="text-button" onClick={() => backToLibrary('videos')}><ArrowLeft size={15}/> Back to videos</button></div>;
    return <div className="lh-workspace">
      <button className="lh-back-link" onClick={() => backToLibrary('videos')}><ArrowLeft size={16}/> All course videos</button>
      <div className="lh-video-workspace">
        <MultiPlatformVideoEmbed url={video.video_url} title={video.title} thumbnail={video.thumbnail_url}/>
        <span className="lh-kicker">{video.category} · {video.difficulty} · {duration(video.duration_seconds, true)}</span>
        <h1>{video.title}</h1><p>{video.description}</p>
        <div className="lh-creator-line"><span className="lh-creator-avatar">{(video.instructor || 'S').slice(0, 1).toUpperCase()}</span>
          <b>{video.instructor || 'SigniAI'}</b></div>
        {video.notes && <section className="lh-video-notes"><h2>Lesson notes</h2><ReaderContent value={video.notes}/></section>}
        {video.code_example && <section className="lh-code-example"><h2>Code example</h2><pre><code>{video.code_example}</code></pre></section>}
        {video.resources?.length > 0 && <section className="lh-video-resources"><h2>Resources</h2>{video.resources.map(resource =>
          <a key={resource} href={resource} target="_blank" rel="noreferrer">{resource}<ExternalLink size={13}/></a>)}</section>}
      </div>
    </div>;
  }

  function renderBookWorkspace() {
    if (!book) return <div className="lh-state"><BookOpen size={25}/><b>Resource unavailable</b><span>This resource may have been unpublished.</span>
      <button className="text-button" onClick={() => backToLibrary('books')}><ArrowLeft size={15}/> Back to resources</button></div>;
    return <div className="lh-workspace">
      <button className="lh-back-link" onClick={() => backToLibrary('books')}><ArrowLeft size={16}/> Books & resources</button>
      <article className="lh-book-workspace"><span className="lh-kicker">{book.technology} · {book.difficulty}</span>
        <h1>{book.title}</h1><p>{book.author}</p><p>{book.description}</p>
        {book.preview_url && <FullscreenPreview title={`${book.title} preview`} className="lh-book-preview">
          <iframe title={`${book.title} preview`} src={book.preview_url} loading="lazy" allow="fullscreen" allowFullScreen/>
        </FullscreenPreview>}
        <a className="workspace-primary" href={book.resource_url} target="_blank" rel="noreferrer">Open resource <ExternalLink size={15}/></a>
        {book.reference_url && <a className="lh-book-reference" href={book.reference_url} target="_blank" rel="noreferrer">Reference / source <ExternalLink size={14}/></a>}
      </article>
    </div>;
  }

  function renderShorts() {
    return <div className="lh-shorts-page">
      <header className="lh-shorts-header"><button className="lh-back-link" onClick={() => backToLibrary('courses')}><ArrowLeft size={16}/> Learning Hub</button>
        <span>SigniAI Shorts · {shorts.length}/{totals.shorts}</span><button disabled={!canControlShortMute} aria-label={canControlShortMute ? (muted ? 'Unmute short videos' : 'Mute short videos') : `Use ${activeShortProvider} player controls to change volume`} title={canControlShortMute ? '' : `Use the ${activeShortProvider} player controls to change volume`} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
      </header>
      <div className="lh-short-categories" aria-label="Filter short videos by category">
        <button className={!shortCategory ? 'active' : ''} onClick={() => setShortCategory('')}>All</button>
        {shortCategories.map(item => <button key={item} className={shortCategory === item ? 'active' : ''}
          onClick={() => setShortCategory(item)}>{item}</button>)}
      </div>
      <div className="lh-shorts-feed" aria-label="Short educational videos">
        {shorts.map((item, index) => <article className="lh-short-card" key={item.id} data-index={index}
          ref={node => { cardRefs.current[index] = node; }}>
          <div className="lh-short-video">
            <MultiPlatformVideoEmbed
              url={item.video_url}
              title={item.title}
              thumbnail={item.thumbnail_url}
              active={index === activeShort}
              autoplay
              muted={muted}
              portrait
            />
          </div>
          <div className="lh-short-copy"><span>{item.category} · {duration(item.duration_seconds, true)}</span>
            <h2>{item.title}</h2><p>{item.caption || item.description}</p><small>By {item.creator || item.instructor || 'SigniAI'}</small></div>
        </article>)}
        {loadingMore && <div className="lh-short-loading" role="status">Loading more shorts…</div>}
        {!shorts.length && loadingMore && <div className="lh-state" role="status">Loading short videos…</div>}
        {!shorts.length && !loadingMore && <div className="lh-state"><Play size={25}/><b>No published shorts yet</b><span>Check back for new quick lessons.</span></div>}
      </div>
      {error && <div className="inline-error lh-short-error" role="alert">{error}</div>}
    </div>;
  }

  if (route.type === 'shorts') return renderShorts();
  if (route.type === 'course') return <div className="learning-hub">{loading
    ? <div className="lh-state" role="status">Loading course…</div> : renderCourseWorkspace()}</div>;
  if (route.type === 'video') return <div className="learning-hub">{loading
    ? <div className="lh-state" role="status">Loading video…</div> : renderVideoWorkspace()}</div>;
  if (route.type === 'book') return <div className="learning-hub">{loading
    ? <div className="lh-state" role="status">Loading resource…</div> : renderBookWorkspace()}</div>;

  return <div className="learning-hub">
    {renderLibrary()}
  </div>;
}
