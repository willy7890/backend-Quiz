import React, { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Code2, Trophy, Flame, CircleCheck, CircleX, Flower2, ArrowRight, RefreshCw, Users, Sparkles, Zap, ChevronRight, ShieldCheck } from 'lucide-react';
import Workspaces from './Workspaces.jsx';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

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
  const [active, setActive] = useState(0);
  const [token, setToken] = useState(localStorage.getItem('fastquiz_token') || '');
  const [user, setUser] = useState(getStoredUser);
  const [authMode, setAuthMode] = useState('login');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authInvitationCode, setAuthInvitationCode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('quiz');

  async function load() {
    setLoading(true); setError('');
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [qRes, lRes] = await Promise.all([fetch(`${API}/api/questions`, { headers }), fetch(`${API}/api/leaderboard`)]);
      if (!qRes.ok || !lRes.ok) throw new Error('Could not connect to the API. Is the FastAPI server running?');
      setQuestions(await qRes.json()); setLeaderboard(await lRes.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [token]);
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

  function saveSession(data) {
    localStorage.setItem('fastquiz_token', data.access_token);
    localStorage.setItem('fastquiz_user', JSON.stringify(data.user));
    setToken(data.access_token); setUser(data.user); setAuthOpen(false);
    setAuthEmail(''); setAuthPassword(''); setAuthDisplayName(''); setAuthInvitationCode('');
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

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(`${API}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: profileName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Profile update failed');
      setUser(data);
      localStorage.setItem('fastquiz_user', JSON.stringify(data));
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
  const correctOption = question?.options?.find(o => o.id === (result?.correct_option_id ?? question?.correct_option_id));

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); setTab('quiz')}}><span className="brand-icon"><Code2 size={21}/></span><span>Fast<span className="brand-accent">Quiz</span><small>BACKEND ARENA</small></span></a>
      <nav>
        <button className={tab==='quiz'?'nav-active':''} onClick={()=>setTab('quiz')}>Practice</button>
        <button className={tab==='quizzes'?'nav-active':''} onClick={()=>setTab('quizzes')}>Quizzes</button>
        {user && <button className={tab==='tasks'?'nav-active':''} onClick={()=>setTab('tasks')}>Tasks</button>}
        {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && <button className={tab==='admin'?'nav-active':''} onClick={()=>setTab('admin')}>Manage</button>}
        <button className={tab==='leaderboard'?'nav-active':''} onClick={()=>setTab('leaderboard')}>Leaderboard</button>
      </nav>
      <div className="top-user">{user ? <><span className="online-dot"/><span>{name}</span><button className="auth-nav-button" onClick={()=>{setProfileName(name);setProfileOpen(true);setError('')}}>Profile</button><button className="auth-nav-button" onClick={logout}>Log out</button></> : <button className="auth-nav-button" onClick={()=>{setAuthOpen(true);setError('')}}>Log in / Sign up</button>}</div>
    </header>

    <main className="layout">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/> COMMUNITY CHALLENGE · SEASON 01</div>
          <h1>Prove your backend<br/><span>knowledge.</span></h1>
          <p>Think fast. Choose wisely. Climb the leaderboard. Every correct answer earns <b>10 points</b> and a rose. 🌹</p>
          <div className="hero-stats"><div><Users size={17}/><span><b>{leaderboard.length}</b> players ranked</span></div><div><Zap size={17}/><span><b>{questions.length}</b> questions</span></div><div><ShieldCheck size={17}/><span>FastAPI powered</span></div></div>
        </div>
        <div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="code-window"><div className="window-dots"><i/><i/><i/><span>main.py</span></div><pre><em>from</em> fastapi <em>import</em> FastAPI{'\n\n'}app = FastAPI(){'\n\n'}<strong>@app.get</strong>(<b>"/challenge"</b>){'\n'}<em>def</em> <strong>play</strong>():{'\n'}    <em>return</em> {'{'}<b>"win"</b>: <u>True</u>{'}'}</pre><div className="code-footer"><span><span className="online-dot"/> API is ready</span><span>Python 3</span></div></div><div className="floating-rose">🌹<small>+10 XP</small></div></div>
      </section>

      <div className="content-grid">
        <section className="main-column">
          {tab === 'leaderboard' ? <div className="panel">
            <div className="section-heading"><div><span className="section-kicker">THE TOP PLAYERS</span><h2><Trophy size={23}/> Leaderboard</h2></div><span className="live-pill">LIVE SCORES</span></div>
            {leaderboard.length ? <div className="leader-list">{leaderboard.map((p,i)=><div className="leader-row" key={p.name}><span className={`rank rank-${i+1}`}>{i===0?'👑':`#${i+1}`}</span><div className="avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="leader-name"><b>{p.name}</b><small>{p.correct} correct · {p.answered} answered</small></div><div className="leader-score"><b>{p.points} XP</b><small>{'🌹'.repeat(Math.min(p.roses,5)) || '—'}</small></div></div>)}</div> : <div className="empty-state"><Trophy size={34}/><b>First place is waiting for you.</b><span>Answer a quiz to appear here.</span></div>}
          </div> : tab === 'quiz' ? <div className="panel quiz-panel">
            <div className="section-heading"><div><span className="section-kicker">DAILY KNOWLEDGE DROP</span><h2><span className="question-number">{String(active+1).padStart(2,'0')}</span> Backend Challenge</h2></div><span className="difficulty"><Flame size={15}/> PRACTICE</span></div>
            {!user && <div className="login-prompt"><ShieldCheck size={18}/><span><b>Join the arena to vote</b><small>Create an account with email or continue with Google. Your points and roses will be saved to your profile.</small></span><button onClick={()=>setAuthOpen(true)}>Join now <ArrowRight size={15}/></button></div>}
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
              {result ? <div className={`feedback ${result.is_correct?'feedback-good':'feedback-bad'}`}><div className="feedback-icon">{result.is_correct?<CircleCheck/>:<CircleX/>}</div><div className="feedback-copy"><b>{result.is_correct?'Brilliant! That is correct. 🌹':'Not quite — keep learning!'}</b><p>{result.explanation}</p><small>{result.points_earned} points earned · Total {result.total_points} XP · {result.roses} 🌹</small></div><button className="next-button" onClick={nextQuestion}>Next <ChevronRight size={17}/></button></div>
              : question.user_has_voted ? <div className="already-voted"><CircleCheck size={18}/> You have already voted on this question. <button onClick={async()=>{const r=await fetch(`${API}/api/results/${question.id}`, {headers:{Authorization:`Bearer ${token}`}}); const data=await r.json(); if(!r.ok){setError(data.detail || 'Could not load results');return;} setQuestions(old=>old.map((q,i)=>i===active?{...q,...data}:q));}}>View results</button></div>
              : <div className="quiz-actions"><span><Users size={16}/> {totalVotes} votes so far</span><button disabled={!choice || !name} onClick={vote}>Submit answer <ArrowRight size={17}/></button></div>}
              {error && <div className="inline-error">{error}</div>}
            </> : <div className="empty-state">No questions found.</div>}
            <div className="question-footer"><span><span className="footer-dot"/> Results update after each vote</span><span>Question {Math.min(active+1, questions.length)} of {questions.length || '—'}</span></div>
          </div> : <Workspaces api={API} token={token} view={tab} role={user?.role || 'MEMBER'} onLogin={() => setAuthOpen(true)}/>}
          <div className="below-cards"><div className="mini-card"><span className="mini-icon violet"><Code2 size={19}/></span><div><b>Learn by doing</b><small>Real backend concepts, bite-sized.</small></div></div><div className="mini-card"><span className="mini-icon gold"><Flower2 size={19}/></span><div><b>Collect roses</b><small>10 XP for every correct answer.</small></div></div></div>
        </section>

        <aside className="side-column">
          <div className="panel profile-panel"><div className="section-heading"><div><span className="section-kicker">YOUR PROGRESS</span><h2>Player card</h2></div><Sparkles size={20} className="sparkle"/></div><div className="profile-person"><div className="profile-avatar">{name ? name.slice(0,1).toUpperCase() : '?'}</div><div><b>{name || 'Future champion'}</b><small>{name?'Backend learner':'Join to start scoring'}</small></div></div><div className="profile-stats"><div><strong>{leaderboard.find(p=>p.name.toLowerCase()===name.toLowerCase())?.points || 0}</strong><span>Total XP</span></div><div><strong>{leaderboard.find(p=>p.name.toLowerCase()===name.toLowerCase())?.roses || 0} 🌹</strong><span>Roses earned</span></div></div><div className="progress-label"><span>Next rose reward</span><b>{(leaderboard.find(p=>p.name.toLowerCase()===name.toLowerCase())?.points || 0)%10}/10 XP</b></div><div className="progress-track"><span style={{width:`${(leaderboard.find(p=>p.name.toLowerCase()===name.toLowerCase())?.points || 0)%10*10}%`}}/></div></div>
          <div className="panel leaderboard-preview"><div className="section-heading"><div><span className="section-kicker">THE HALL OF FAME</span><h2><Trophy size={20}/> Top players</h2></div><button className="text-button" onClick={()=>setTab('leaderboard')}>View all <ArrowRight size={14}/></button></div>{leaderboard.slice(0,5).length ? leaderboard.slice(0,5).map((p,i)=><div className="preview-row" key={p.name}><span className={`tiny-rank r${i+1}`}>{i===0?'♛':i+1}</span><span className="preview-avatar">{p.name.slice(0,1).toUpperCase()}</span><span className="preview-name">{p.name}</span><b>{p.points} <small>XP</small></b></div>) : <div className="preview-empty">Your name could be the first here ✨</div>}</div>
          <div className="tip-card"><div className="tip-icon"><Zap size={19}/></div><div><b>Backend tip</b><p>FastAPI automatically generates interactive API docs at <code>/docs</code>. Try it when the API is running.</p></div></div>
        </aside>
      </div>
      {authOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sign in to FastQuiz">
        <div className="auth-modal">
          <button className="modal-close" onClick={()=>setAuthOpen(false)} aria-label="Close">×</button>
          <div className="auth-logo"><span className="brand-icon"><Code2 size={21}/></span></div>
          <span className="section-kicker">YOUR BACKEND JOURNEY STARTS HERE</span>
          <h2>{authMode==='register'?'Create your account':'Welcome back'}</h2>
          <p className="auth-subtitle">Save your quiz results, climb the leaderboard and collect roses 🌹</p>
          <div className="auth-tabs"><button className={authMode==='login'?'selected':''} onClick={()=>{setAuthMode('login');setError('')}}>Log in</button><button className={authMode==='register'?'selected':''} onClick={()=>{setAuthMode('register');setError('')}}>Create account</button></div>
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode==='register' && <label>Display name<input required minLength="2" maxLength="80" value={authDisplayName} onChange={e=>setAuthDisplayName(e.target.value)} placeholder="How should we call you?"/></label>}
            <label>Email address<input required type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/></label>
            {authMode==='register' && <label>Team invitation code (optional)<input value={authInvitationCode} onChange={e=>setAuthInvitationCode(e.target.value)} autoComplete="off" placeholder="Paste the code from your admin"/></label>}
            <label>Password<input required minLength={authMode==='register'?8:1} type="password" autoComplete={authMode==='register'?'new-password':'current-password'} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={authMode==='register'?'At least 8 characters':'Your password'}/></label>
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
            <label>Display name<input required minLength="2" maxLength="80" value={profileName} onChange={event=>setProfileName(event.target.value)} /></label>
            <button className="auth-submit">Save profile <ArrowRight size={16}/></button>
          </form>
          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>}
      <footer><a className="brand footer-brand" href="#"><span className="brand-icon"><Code2 size={17}/></span><span>Fast<span className="brand-accent">Quiz</span></span></a><span>Built for the backend community · Powered by FastAPI + React</span><button onClick={load}><RefreshCw size={14}/> Refresh data</button></footer>
    </main>
  </div>;
}
