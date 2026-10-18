import React, { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Code2, Trophy, Flame, CircleCheck, CircleX, Monitor, ArrowRight, RefreshCw, Users, Sparkles, Zap, ChevronRight, ShieldCheck, Menu, X, Eye, EyeOff, BookOpen, Home, UserRoundPlus } from 'lucide-react';
import Workspaces from './Workspaces.jsx';
import LearningHub from './LearningHub.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import WinnerAnnouncements from './WinnerAnnouncements.jsx';
import { Sun, Moon, Camera, GraduationCap } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const DEFAULT_COMPUTER_REWARD_POINTS = 20;

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('fastquiz_user') || 'null');
  } catch {
    return null;
  }
}

export default function App({ googleEnabled = false }) {
  const [questions, setQuestions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentAttempts, setRecentAttempts] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [computerRewardPoints, setComputerRewardPoints] = useState(DEFAULT_COMPUTER_REWARD_POINTS);
  const [active, setActive] = useState(0);
  const [token, setToken] = useState(localStorage.getItem('fastquiz_token') || '');
  const [user, setUser] = useState(getStoredUser);
  const [authMode, setAuthMode] = useState('login');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authInvitationCode, setAuthInvitationCode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(() => {
    const route = window.location.hash.slice(1);
    return ['home', 'practice', 'quizzes', 'tasks', 'learning', 'leaderboard', 'winners', 'admin'].includes(route)
      ? route
      : 'home';
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('fastquiz_theme') === 'light' ? 'light' : 'dark');
  const [avatarData, setAvatarData] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [qRes, lRes, configRes] = await Promise.all([
        fetch(`${API}/api/questions`, { headers }),
        fetch(`${API}/api/leaderboard`),
        fetch(`${API}/api/config`),
      ]);
      if (!qRes.ok || !lRes.ok || !configRes.ok) throw new Error('Could not connect to the API. Is the FastAPI server running?');
      const config = await configRes.json();
      setQuestions(await qRes.json()); setLeaderboard(await lRes.json());
      setComputerRewardPoints(config.computer_reward_points);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const onHashChange = () => {
      const route = window.location.hash.slice(1);
      setTab(['home', 'practice', 'quizzes', 'tasks', 'learning', 'leaderboard', 'winners', 'admin'].includes(route) ? route : 'home');
      setMobileMenuOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    fetch(`${API}/api/quizzes/winner-announcements`)
      .then(async response => {
        if (!response.ok) throw new Error(`Could not check for completed quiz announcements (${response.status}).`);
        await response.json();
      })
      .catch(cause => setError(cause.message));
  }, []);
  useEffect(() => {
    if (!token) {
      setMyStats(null);
      return;
    }
    fetch(`${API}/api/me/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (!response.ok) throw new Error(`Could not load your progress (${response.status}).`);
        setMyStats(await response.json());
      })
      .catch(cause => setError(cause.message));
  }, [token]);
  useEffect(() => {
    if (!token || tab !== 'home') {
      if (!token) setRecentAttempts([]);
      return;
    }
    fetch(`${API}/api/quizzes/me/attempts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (!response.ok) throw new Error(`Could not load recent activity (${response.status}).`);
        setRecentAttempts(await response.json());
      })
      .catch(cause => setError(cause.message));
  }, [token, tab]);
  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${API}/api/leaderboard`);
        if (!response.ok) throw new Error(`Leaderboard refresh failed (${response.status}).`);
        setLeaderboard(await response.json());
      } catch (cause) {
        setError(cause.message);
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fastquiz_theme', theme);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'light' ? '#f5f7fb' : '#090f1c';
  }, [theme]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (response.status === 401) {
          localStorage.removeItem('fastquiz_token');
          localStorage.removeItem('fastquiz_user');
          setToken('');
          setUser(null);
          return;
        }
        if (!response.ok) throw new Error('Could not validate your session.');
        const currentUser = await response.json();
        localStorage.setItem('fastquiz_user', JSON.stringify(currentUser));
        setUser(currentUser);
      })
      .catch(e => setError(e.message));
  }, [token]);
  const question = questions[active];

  function shouldHideError(message = '') {
    const value = String(message).trim().toLowerCase();
    return !value || /failed to fetch|could not connect to the api|network error|fetch.*failed/.test(value);
  }

  function saveSession(data) {
    localStorage.setItem('fastquiz_token', data.access_token);
    localStorage.setItem('fastquiz_user', JSON.stringify(data.user));
    setToken(data.access_token); setUser(data.user); setAuthOpen(false);
    setAuthEmail(''); setAuthPassword(''); setAuthDisplayName(''); setAuthInvitationCode('');
    setPasswordVisible(false);
    setResult(null); setChoice(null); setError('');
  }

  async function submitAuth(e) {
    e.preventDefault(); setAuthBusy(true); setError('');
    try {
      const path = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = authMode === 'register'
        ? {
          email: authEmail,
          password: authPassword,
          display_name: authDisplayName,
          ...(authInvitationCode.trim() ? { invitation_code: authInvitationCode.trim() } : {}),
        }
        : { email: authEmail, password: authPassword };
      const res = await fetch(`${API}${path}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail.map(item => item.msg).join('; ') : data.detail || 'Authentication failed');
      saveSession(data);
    } catch (e) { setError(e.message); } finally { setAuthBusy(false); }
  }

  async function googleSignIn(credentialResponse) {
    if (!credentialResponse.credential) {
      setError('Google sign-in did not return a credential. Please try again.');
      return;
    }
    setAuthBusy(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/google`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({credential:credentialResponse.credential}) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail.map(item => item.msg).join('; ') : data.detail || 'Google sign-in failed');
      saveSession(data);
    } catch(e) { setError(e.message); } finally { setAuthBusy(false); }
  }

  function logout() {
    localStorage.removeItem('fastquiz_token'); localStorage.removeItem('fastquiz_user');
    setToken(''); setUser(null); setResult(null); setChoice(null); setAuthOpen(false);
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP image.'); event.target.value=''; return; }
    if (file.size > 2 * 1024 * 1024) { setError('Please choose an image smaller than 2 MB.'); event.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image(); img.onload = () => {
        const canvas = document.createElement('canvas'); const max = 480; const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); setAvatarData(canvas.toDataURL('image/jpeg', 0.82));
      }; img.onerror = () => setError('Could not read this image. Try another one.'); img.src = reader.result;
    }; reader.readAsDataURL(file);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(`${API}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: profileName.trim(), ...(avatarData ? { avatar_data: avatarData } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Profile update failed');
      setUser(data);
      localStorage.setItem('fastquiz_user', JSON.stringify(data));
      setAvatarData('');
      setProfileOpen(false);
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function vote() {
    if (!name) { setError('Enter your display name before voting.'); return; }
    if (!choice) return;
    setError('');
    try {
      if (!token) { setAuthOpen(true); setError('Log in or create an account before voting.'); return; }
      const res = await fetch(`${API}/api/questions/${question.id}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ option_id: choice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Vote failed');
      setResult(data);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function nextQuestion() {
    setChoice(null); setResult(null);
    setActive((active + 1) % Math.max(questions.length, 1));
  }

  const totalVotes = question?.total_votes || 0;
  const name = user?.display_name || '';
  const myScore = leaderboard.find(player => player.id === user?.id)
    || leaderboard.find(player => player.name.toLowerCase() === name.toLowerCase());
  const myPoints = myStats?.points ?? myScore?.points ?? 0;
  const myComputers = myStats?.computers ?? myScore?.computers ?? 0;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const pageMeta = {
    practice: ['Practice', 'Answer a focused question, review the explanation, and earn points for correct answers.'],
    quizzes: ['Quizzes', 'Take published quizzes, review your submitted results, and track your quiz history.'],
    tasks: ['Tasks', 'Review assigned work, follow its requirements, and keep your completion status up to date.'],
    learning: ['Learning Hub', 'Explore learning paths, lessons, roadmaps, notes, and curated resources.'],
    leaderboard: ['Leaderboard', 'See the current ranked players, their points, and computers earned.'],
    winners: ['Winner announcements', 'Browse official results from completed quizzes and preview or download each winner poster.'],
    admin: ['Manage', 'Create and manage quizzes, tasks, learning content, and official winner announcements.'],
  }[tab];
  const navigate = view => {
    setTab(view);
    setMobileMenuOpen(false);
    if (window.location.hash !== `#${view}`) window.location.hash = view;
  };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={e => {e.preventDefault(); navigate('home')}}><span className="brand-icon"><Code2 size={21}/></span><span>Fast<span className="brand-accent">Quiz</span><small>BACKEND ARENA</small></span></a>
      <button className="mobile-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen ? <X size={20}/> : <Menu size={20}/>}</button>
      <nav className={mobileMenuOpen ? 'mobile-open' : ''} aria-label="Main navigation">
        <button className={tab==='home'?'nav-active':''} onClick={()=>navigate('home')}><Home size={14} aria-hidden="true"/>Home</button>
        <button className={tab==='practice'?'nav-active':''} onClick={()=>navigate('practice')}><Code2 size={14} aria-hidden="true"/>Practice</button>
        <button className={tab==='quizzes'?'nav-active':''} onClick={()=>navigate('quizzes')}><BookOpen size={14} aria-hidden="true"/>Quizzes</button>
        <button className={tab==='tasks'?'nav-active':''} onClick={()=>navigate('tasks')}><CircleCheck size={14} aria-hidden="true"/>Tasks</button>
        {isAdmin && <button className={tab==='admin'?'nav-active':''} onClick={()=>navigate('admin')}>Manage</button>}
        <button className={tab==='learning'?'nav-active':''} onClick={()=>navigate('learning')}><GraduationCap size={14} aria-hidden="true"/>Learning Hub</button>
        <button className={tab==='leaderboard'?'nav-active':''} onClick={()=>navigate('leaderboard')}><Trophy size={14} aria-hidden="true"/>Leaderboard</button>
        <button className={tab==='winners'?'nav-active':''} onClick={()=>navigate('winners')}><Sparkles size={14} aria-hidden="true"/>Winners</button>
      </nav>
      <div className="top-user"><button className="theme-toggle" title={theme==='dark'?'Switch to light theme':'Switch to dark theme'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>{user ? <><span className="online-dot"/>{user.avatar_data ? <img className="top-avatar" src={user.avatar_data} alt="Profile"/> : null}<span>{name}</span><button className="auth-nav-button" onClick={()=>{setProfileName(name);setAvatarData('');setProfileOpen(true);setError('')}}>Profile</button><button className="auth-nav-button" onClick={logout}>Log out</button></> : <button className="auth-nav-button" onClick={()=>{setAuthOpen(true);setError('')}}><UserRoundPlus size={14} aria-hidden="true"/>Log in / Sign up</button>}</div>
    </header>

    <main className="layout" id="main-content">
      {error && tab !== 'practice' && !authOpen && !profileOpen && !shouldHideError(error) && <div className="global-error" role="alert">{error}</div>}
      {tab === 'home' && <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/> BACKEND PRACTICE</div>
          <h1>Sharpen your backend<br/><span>skills, one question at a time.</span></h1>
          <p>Practice, take focused quizzes, and track your progress. Practice questions award <b>10 points</b> each. Earn one computer for every {computerRewardPoints} total points.</p>
          <div className="hero-stats"><div><Users size={17}/><span><b>{leaderboard.length}</b> players ranked</span></div><div><Zap size={17}/><span><b>{questions.length}</b> questions</span></div><div><ShieldCheck size={17}/><span>FastAPI powered</span></div></div>
        </div>
        <div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="code-window"><div className="window-dots"><i/><i/><i/><span>main.py</span></div><pre><em>from</em> fastapi <em>import</em> FastAPI{'\n\n'}app = FastAPI(){'\n\n'}<strong>@app.get</strong>(<b>"/api/health"</b>){'\n'}<em>def</em> <strong>health</strong>():{'\n'}    <em>return</em> {'{'}<b>"status"</b>: <u>"ok"</u>{'}'}</pre><div className="code-footer"><span>FastAPI example</span><span>Python 3</span></div></div><div className="floating-computer">💻<small>1 COMPUTER · {computerRewardPoints} POINTS</small></div></div>
      </section>}

      {pageMeta && <section className="page-intro">
        <span className="section-kicker">SIGNIAI LEARNING ARENA</span>
        <h1>{pageMeta[0]}</h1>
        <p>{pageMeta[1]}</p>
      </section>}

      <div className={`content-grid${tab === 'tasks' ? ' tasks-layout-grid' : ''}`}>
        <section className="main-column">
          {tab === 'home' ? <div className="home-content">
            <div className="home-stats-grid">
              <article className="home-stat-card"><span className="mini-icon violet"><Zap size={19}/></span><div><strong>{myPoints}</strong><small>Your points</small></div></article>
              <article className="home-stat-card"><span className="mini-icon gold"><Monitor size={19}/></span><div><strong>{myComputers}</strong><small>Computers earned</small></div></article>
              <article className="home-stat-card"><span className="mini-icon"><Users size={19}/></span><div><strong>{leaderboard.length}</strong><small>Players ranked</small></div></article>
            </div>
            <div className="panel home-overview">
              <div className="section-heading"><div><span className="section-kicker">YOUR NEXT STEPS</span><h2>Explore the arena</h2></div></div>
              <div className="home-action-grid">
                <button onClick={()=>navigate('practice')}><Code2 size={19}/><b>Practice</b><small>Answer questions and learn from feedback</small><ArrowRight size={16}/></button>
                <button onClick={()=>navigate('quizzes')}><BookOpen size={19}/><b>Quizzes</b><small>Take a focused quiz and save your score</small><ArrowRight size={16}/></button>
                <button onClick={()=>navigate('tasks')}><CircleCheck size={19}/><b>Tasks</b><small>Review assigned tasks and progress</small><ArrowRight size={16}/></button>
                <button onClick={()=>navigate('learning')}><GraduationCap size={19}/><b>Learning Hub</b><small>Follow a roadmap and explore resources</small><ArrowRight size={16}/></button>
                <button onClick={()=>navigate('leaderboard')}><Trophy size={19}/><b>Leaderboard</b><small>See current player rankings</small><ArrowRight size={16}/></button>
              </div>
            </div>
            <div className="panel home-recent">
              <div className="section-heading"><div><span className="section-kicker">RECENT ACTIVITY</span><h2>Keep your momentum</h2></div></div>
              {recentAttempts.length ? recentAttempts.slice(0, 4).map(attempt => <div className="workspace-row" key={attempt.id}><span>{attempt.quiz_title}</span><b>{attempt.score}/{attempt.max_score}</b><small>{new Date(attempt.submitted_at).toLocaleString()}</small></div>)
                : <div className="home-recommendation"><span>{user ? 'No completed quiz attempts yet.' : 'Sign in to save your activity and track your progress.'}</span><button className="text-button" onClick={()=>user ? navigate('quizzes') : setAuthOpen(true)}>{user ? 'Choose a quiz' : 'Sign in'} <ArrowRight size={14}/></button></div>}
              <div className="home-recommendation"><span>Recommended next: {user ? 'try a published quiz or continue a Learning Hub path.' : 'create an account to save points and quiz results.'}</span><button className="text-button" onClick={()=>user ? navigate('learning') : setAuthOpen(true)}>{user ? 'Explore learning' : 'Join now'} <ArrowRight size={14}/></button></div>
            </div>
          </div> : tab === 'learning' ? <LearningHub api={API} token={token} onLogin={() => setAuthOpen(true)}/> : tab === 'winners' ? <WinnerAnnouncements api={API} isAdmin={isAdmin}/> : tab === 'leaderboard' ? <div className="panel">
            <div className="section-heading"><div><span className="section-kicker">THE TOP PLAYERS</span><h2><Trophy size={23}/> Leaderboard</h2></div><div className="leaderboard-actions"><span className="live-pill">LIVE SCORES</span><button className="text-button" onClick={()=>navigate('winners')}>Winner announcements <ArrowRight size={14}/></button></div></div>
            {leaderboard.length ? <div className="leader-list">{leaderboard.map((p,i)=><div className="leader-row" key={p.name}><span className={`rank rank-${i+1}`}>{i===0?'👑':`#${i+1}`}</span><div className="avatar">{p.avatar_data ? <img src={p.avatar_data} alt=""/> : p.name.slice(0,1).toUpperCase()}</div><div className="leader-name"><b>{p.name}</b><small>{p.correct} correct · {p.answered} answered</small></div><div className="leader-score"><b>{p.points} points</b><small><Monitor size={13}/> {p.computers} {p.computers === 1 ? 'computer' : 'computers'}</small></div></div>)}</div> : <div className="empty-state"><Trophy size={34}/><b>First place is waiting for you.</b><span>Answer a quiz to appear here.</span></div>}
          </div> : tab === 'practice' ? <div className="panel quiz-panel">
            <div className="section-heading"><div><span className="section-kicker">PRACTICE MODE</span><h2><span className="question-number">{String(active+1).padStart(2,'0')}</span> Practice question</h2></div><span className="difficulty"><Flame size={15}/> PRACTICE</span></div>
            {!user && <div className="login-prompt"><ShieldCheck size={18}/><span><b>Join the arena to vote</b><small>Create an account with email or continue with Google. Your points and computers will be saved to your profile.</small></span><button onClick={()=>setAuthOpen(true)}>Join now <ArrowRight size={15}/></button></div>}
            {loading ? <div className="empty-state">Loading quiz…</div> : error && !question ? <div className="error-box">{error}<button onClick={load}>Retry</button></div> : question ? <>
              <div className="question-meta"><span>{question.topic}</span><span>ONE ANSWER ONLY</span></div>
              <h3 className="question-title">{question.title}</h3>
              <div className="options">{question.options.map(o=>{
                const isPicked = choice===o.id;
                const isCorrect = result && o.id===result.correct_option_id;
                const isWrongPick = result && isPicked && !result.is_correct;
                const bar = result ? o.percentage : 0;
                return <button key={o.id} className={`option ${isPicked?'picked':''} ${isCorrect?'correct':''} ${isWrongPick?'wrong':''}`} disabled={!!result || question.user_has_voted} onClick={()=>setChoice(o.id)}>
                  {result && <span className="result-bar" style={{width:`${bar}%`}}/>}
                  <span className="option-letter">{o.label}</span><span className="option-text">{o.text}</span>
                  {result ? <span className="option-votes">{o.percentage}% <small>({o.votes})</small></span> : <span className="radio-dot">{isPicked?'✓':''}</span>}
                  {result && isCorrect && <CircleCheck size={18} className="option-status"/>}
                </button>
              })}</div>
              {result ? <div className={`feedback ${result.is_correct?'feedback-good':'feedback-bad'}`}><div className="feedback-icon">{result.is_correct?<CircleCheck/>:<CircleX/>}</div><div className="feedback-copy"><b>{result.is_correct?'Brilliant! That is correct. 💻':'Not quite — keep learning!'}</b><p>{result.explanation}</p><small>{result.points_earned} points earned · Total {result.total_points} points · {result.computers} 💻</small></div><button className="next-button" onClick={nextQuestion}>Next <ChevronRight size={17}/></button></div>
              : question.user_has_voted ? <div className="already-voted"><CircleCheck size={18}/> You have already voted on this question. <button onClick={async()=>{const r=await fetch(`${API}/api/results/${question.id}`, {headers:{Authorization:`Bearer ${token}`}}); const data=await r.json(); if(!r.ok){setError(data.detail || 'Could not load results');return;} setQuestions(old=>old.map((q,i)=>i===active?{...q,...data}:q));}}>View results</button></div>
              : <div className="quiz-actions"><span><Users size={16}/> {totalVotes} votes so far</span><button disabled={!choice || !name} onClick={vote}>Submit answer <ArrowRight size={17}/></button></div>}
              {error && <div className="inline-error">{error}</div>}
            </> : <div className="empty-state">No questions found.</div>}
            <div className="question-footer"><span><span className="footer-dot"/> Results update after each vote</span><span>Question {Math.min(active+1, questions.length)} of {questions.length || '—'}</span></div>
          </div> : tab === 'tasks' && !user ? <div className="panel tasks-login-panel"><div className="empty-state"><ShieldCheck size={32}/><b>Sign in to view your tasks.</b><span>Your assigned work and completion status are saved to your account.</span><button className="workspace-primary" onClick={()=>setAuthOpen(true)}>Log in or create an account <ArrowRight size={15}/></button></div></div> : tab === 'admin' && !isAdmin ? <div className="panel"><div className="empty-state"><ShieldCheck size={32}/><b>Administrator access required.</b><span>Sign in with an administrator account to manage challenge content.</span></div></div> : tab === 'admin' ? <><AdminDashboard api={API} token={token}/><Workspaces api={API} token={token} view={tab} role={user?.role || 'MEMBER'} onLogin={() => setAuthOpen(true)}/></> : <Workspaces api={API} token={token} view={tab} role={user?.role || 'MEMBER'} onLogin={() => setAuthOpen(true)}/>}
        </section>

        <aside className="side-column">
          <div className="panel profile-panel">
            <div className="section-heading"><div><span className="section-kicker">YOUR PROGRESS</span><h2>Player card</h2></div><Sparkles size={20} className="sparkle"/></div>
            <div className="profile-person"><div className="profile-avatar">{user?.avatar_data ? <img src={user.avatar_data} alt={`${name}'s profile`}/> : name ? name.slice(0,1).toUpperCase() : '?'}</div><div><b>{name || 'Future champion'}</b><small>{name?'Backend learner':'Join to start scoring'}</small></div></div>
            <div className="profile-stats"><div><strong>{myPoints}</strong><span>Total points</span></div><div><strong>{myComputers} 💻</strong><span>Computers earned</span></div></div>
            <div className="progress-label"><span>Progress to next computer</span><b>{myPoints % computerRewardPoints}/{computerRewardPoints} points</b></div>
            <div className="progress-track"><span style={{width:`${(myPoints % computerRewardPoints)/computerRewardPoints*100}%`}}/></div>
          </div>
          <div className="panel leaderboard-preview"><div className="section-heading"><div><span className="section-kicker">THE HALL OF FAME</span><h2><Trophy size={20}/> Top players</h2></div><button className="text-button" onClick={()=>navigate('leaderboard')}>View all <ArrowRight size={14}/></button></div>{leaderboard.slice(0,5).length ? leaderboard.slice(0,5).map((p,i)=><div className="preview-row" key={p.name}><span className={`tiny-rank r${i+1}`}>{i===0?'♛':i+1}</span><span className="preview-avatar">{p.avatar_data ? <img src={p.avatar_data} alt=""/> : p.name.slice(0,1).toUpperCase()}</span><span className="preview-name">{p.name}</span><b>{p.points} <small>points</small></b></div>) : <div className="preview-empty">Your name could be the first here ✨</div>}</div>
          <div className="tip-card"><div className="tip-icon"><Zap size={19}/></div><div><b>Backend tip</b><p>FastAPI automatically generates interactive API docs at <code>/docs</code>. Try it when the API is running.</p></div></div>
        </aside>
      </div>
      {authOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sign in to FastQuiz">
        <div className="auth-modal">
          <button className="modal-close" onClick={()=>setAuthOpen(false)} aria-label="Close">×</button>
          <div className="auth-logo"><span className="brand-icon"><Code2 size={21}/></span></div>
          <span className="section-kicker">YOUR BACKEND JOURNEY STARTS HERE</span>
          <h2>{authMode==='register'?'Create your account':'Welcome back'}</h2>
          <p className="auth-subtitle">Save your results, climb the leaderboard, and earn a computer for every {computerRewardPoints} points.</p>
          <div className="auth-tabs"><button type="button" className={authMode==='login'?'selected':''} onClick={()=>{setAuthMode('login');setPasswordVisible(false);setError('')}}>Log in</button><button type="button" className={authMode==='register'?'selected':''} onClick={()=>{setAuthMode('register');setPasswordVisible(false);setError('')}}>Create account</button></div>
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode==='register' && <label>Display name<input required minLength="2" maxLength="80" value={authDisplayName} onChange={e=>setAuthDisplayName(e.target.value)} placeholder="How should we call you?"/></label>}
            <label>Email address<input required type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/></label>
            {authMode==='register' && <label>Team invitation code (optional)<input value={authInvitationCode} onChange={e=>setAuthInvitationCode(e.target.value)} autoComplete="off" placeholder="Paste the code from your admin"/></label>}
            <label>Password<span className="password-input-wrap"><input required minLength={authMode==='register'?8:1} type={passwordVisible?'text':'password'} autoComplete={authMode==='register'?'new-password':'current-password'} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={authMode==='register'?'At least 8 characters':'Your password'}/><button type="button" className="password-visibility" aria-label={passwordVisible?'Hide password':'Show password'} aria-pressed={passwordVisible} onClick={()=>setPasswordVisible(visible=>!visible)}>{passwordVisible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>
            <button className="auth-submit" disabled={authBusy}>{authBusy?'Please wait…':authMode==='register'?'Create account':'Log in'} <ArrowRight size={16}/></button>
          </form>
          {googleEnabled ? <><div className="auth-divider"><span/>or continue with<span/></div><div className="google-button-wrap"><GoogleLogin onSuccess={googleSignIn} onError={()=>setError('Google sign-in did not complete. Please try again.')} text="continue_with" shape="rectangular" theme="filled_black" width="300"/></div></> : <small className="auth-note">Google sign-in is unavailable until the owner configures VITE_GOOGLE_CLIENT_ID.</small>}
          {error && <div className="auth-error">{error}</div>}
          {googleEnabled && <small className="auth-note">Google sign-in requires the matching backend GOOGLE_CLIENT_ID.</small>}
        </div>
      </div>}
      {profileOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit profile">
        <div className="auth-modal">
          <button className="modal-close" onClick={()=>setProfileOpen(false)} aria-label="Close">×</button>
          <span className="section-kicker">YOUR PLAYER PROFILE</span>
          <h2>Edit profile</h2>
          <form className="auth-form" onSubmit={saveProfile}>
            <div className="profile-photo-editor"><div className="profile-photo-preview">{avatarData || user?.avatar_data ? <img src={avatarData || user.avatar_data} alt="Profile preview"/> : <span>{(name || 'U').slice(0,1).toUpperCase()}</span>}</div><label className="photo-upload-label"><Camera size={15}/> Upload profile picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFile}/></label><small>JPG, PNG or WebP · max 2 MB</small></div>
            <label>Display name<input required minLength="2" maxLength="80" value={profileName} onChange={event=>setProfileName(event.target.value)} /></label>
            <button className="auth-submit">Save profile <ArrowRight size={16}/></button>
          </form>
          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>}
      <footer><a className="brand footer-brand" href="#home" onClick={event=>{event.preventDefault();navigate('home')}}><span className="brand-icon"><Code2 size={17}/></span><span>Fast<span className="brand-accent">Quiz</span></span></a><span>Built for the backend community · Powered by FastAPI + React</span><button onClick={load}><RefreshCw size={14}/> Refresh data</button></footer>
    </main>
  </div>;
}
