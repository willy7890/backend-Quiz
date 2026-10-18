import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell, BookOpen, Check, Clock3, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from 'lucide-react';

const taskStatuses = ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];
const emptyQuestion = () => ({ title: '', explanation: '', points: 10, options: ['', '', '', ''], correct_option_index: 0 });
const emptyQuiz = () => ({
  title: '', description: '', category: 'General', difficulty: 'BEGINNER',
  time_limit_seconds: '', available_at: '', closes_at: '', questions: [emptyQuestion()],
});
const emptyTask = () => ({ title: '', description: '', priority: 'MEDIUM', status: 'TO_DO', project: '', requirements: '', difficulty: 'BEGINNER', is_published: true, deadline: '', assignee_id: '' });

function apiError(data, fallback) {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(item => {
    const location = Array.isArray(item.loc) ? item.loc.join('.') : '';
    return `${location ? `${location}: ` : ''}${item.msg}`;
  }).join('; ');
  return fallback;
}

export default function Workspaces({ api, token, view, role, onLogin }) {
  const [quizzes, setQuizzes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [report, setReport] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [quizForm, setQuizForm] = useState(emptyQuiz());
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [taskForm, setTaskForm] = useState(emptyTask());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [filter, setFilter] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [taskDetailsError, setTaskDetailsError] = useState('');
  const [notice, setNotice] = useState('');

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isSuperAdmin = role === 'SUPER_ADMIN';

  async function request(path, options = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
    const response = await fetch(`${api}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${apiError(data, `Request failed (${response.status})`)} (${options.method || 'GET'} ${path})`);
    return data;
  }

  async function reload() {
    setError('');
    setTaskError('');
    setTaskDetailsError('');
    if (view === 'tasks' && !token) {
      setTasks([]);
      setNotifications([]);
      setAttempts([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      if (view === 'quizzes') {
        setQuizzes(await request('/api/quizzes'));
        setAttempts(token ? await request('/api/quizzes/me/attempts') : []);
      } else if (view === 'tasks') {
        const query = filter.trim() ? `?search=${encodeURIComponent(filter.trim())}` : '';
        setTasks(await request(`/api/tasks${query}`));
        setNotifications([]);
        setAttempts([]);

        const [notificationResult, attemptResult] = await Promise.allSettled([
          request('/api/notifications'),
          request('/api/quizzes/me/attempts'),
        ]);
        const detailErrors = [];
        if (notificationResult.status === 'fulfilled') {
          setNotifications(notificationResult.value);
        } else {
          detailErrors.push(`Notifications: ${notificationResult.reason.message}`);
        }
        if (attemptResult.status === 'fulfilled') {
          setAttempts(attemptResult.value);
        } else {
          detailErrors.push(`Quiz progress: ${attemptResult.reason.message}`);
        }
        setTaskDetailsError(detailErrors.join(' '));
      } else if (view === 'admin') {
        const [quizRows, taskRows, userRows, dashboard] = await Promise.all([
          request('/api/quizzes/admin'),
          request('/api/tasks'),
          request('/api/admin/users'),
          request('/api/admin/report'),
        ]);
        setQuizzes(quizRows);
        setTasks(taskRows);
        setUsers(userRows);
        setReport(dashboard);
        setNotifications(await request('/api/notifications'));
      }
    } catch (cause) {
      if (view === 'tasks') {
        setTaskError(cause.message);
      } else {
        setError(cause.message);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { reload(); }, [view, token]);

  useEffect(() => {
    if (!activeQuiz || !activeQuiz.time_limit_seconds || !activeQuiz.started_at || quizResult) {
      setRemainingSeconds(null);
      return undefined;
    }
    const started = new Date(activeQuiz.started_at).getTime();
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((started + activeQuiz.time_limit_seconds * 1000 - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [activeQuiz, quizResult]);

  function message(action, text) {
    setNotice(text);
    setError('');
    if (action) action();
  }

  async function openQuiz(id) {
    if (!token) {
      onLogin?.();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const started = await request(`/api/quizzes/${id}/start`, { method: 'POST' });
      const quiz = await request(`/api/quizzes/${id}`);
      setActiveQuiz({ ...quiz, started_at: started.started_at });
      setAnswers({});
      setQuizResult(null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(event) {
    event.preventDefault();
    if (!activeQuiz) return;
    setBusy(true);
    setError('');
    try {
      const result = await request(`/api/quizzes/${activeQuiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: activeQuiz.questions.map(question => ({
            question_id: question.id,
            option_id: Number(answers[question.id]),
          })),
        }),
      });
      setQuizResult(result);
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(index, key, value) {
    setQuizForm(current => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question
      ),
    }));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setQuizForm(current => ({
      ...current,
      questions: current.questions.map((question, index) => index === questionIndex
        ? { ...question, options: question.options.map((option, itemIndex) => itemIndex === optionIndex ? value : option) }
        : question),
    }));
  }

  async function saveQuiz(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...quizForm,
        time_limit_seconds: quizForm.time_limit_seconds ? Number(quizForm.time_limit_seconds) : null,
        available_at: quizForm.available_at ? new Date(quizForm.available_at).toISOString() : null,
        closes_at: quizForm.closes_at ? new Date(quizForm.closes_at).toISOString() : null,
        questions: quizForm.questions.map(question => ({
          ...question,
          points: Number(question.points),
          options: question.options.map(option => option.trim()).filter(Boolean),
          correct_option_index: Number(question.correct_option_index),
        })),
      };
      await request(editingQuizId ? `/api/quizzes/${editingQuizId}` : '/api/quizzes', {
        method: editingQuizId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setQuizForm(emptyQuiz());
      setEditingQuizId(null);
      message(reload, editingQuizId ? 'Quiz updated.' : 'Draft quiz created.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function editQuiz(id) {
    try {
      const quiz = await request(`/api/quizzes/${id}/preview`);
      setQuizForm({
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        difficulty: quiz.difficulty,
        time_limit_seconds: quiz.time_limit_seconds || '',
        available_at: quiz.available_at ? quiz.available_at.slice(0, 16) : '',
        closes_at: quiz.closes_at ? quiz.closes_at.slice(0, 16) : '',
        questions: quiz.questions.map(question => ({
          title: question.title,
          explanation: question.explanation,
          points: question.points,
          options: question.options.map(option => option.text),
          correct_option_index: question.options.findIndex(option => option.id === question.correct_option_id),
        })),
      });
      setEditingQuizId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function setPublished(quiz) {
    try {
      await request(`/api/quizzes/${quiz.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: !quiz.is_published }),
      });
      message(reload, quiz.is_published ? 'Quiz unpublished.' : 'Quiz published.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function deleteQuiz(id) {
    if (!window.confirm('Delete this draft quiz? Quizzes with attempts cannot be deleted.')) return;
    try {
      await request(`/api/quizzes/${id}`, { method: 'DELETE' });
      message(reload, 'Quiz deleted.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function showAttempts(id) {
    try {
      setAttempts(await request(`/api/quizzes/${id}/attempts`));
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function publishWinnerAnnouncement(quiz) {
    if (!window.confirm(`Close "${quiz.title}" and publish its official winner? Submitted results will be final.`)) return;
    setBusy(true);
    setError('');
    try {
      const announcement = await request(`/api/quizzes/${quiz.id}/winner-announcement`, { method: 'POST' });
      message(reload, `Official winner ${announcement.winner.name} published for ${announcement.challenge_title}.`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...taskForm,
        assignee_id: taskForm.assignee_id ? Number(taskForm.assignee_id) : null,
        deadline: taskForm.deadline ? new Date(taskForm.deadline).toISOString() : null,
      };
      await request(editingTaskId ? `/api/tasks/${editingTaskId}` : '/api/tasks', {
        method: editingTaskId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setTaskForm(emptyTask());
      setEditingTaskId(null);
      message(reload, editingTaskId ? 'Task updated.' : 'Task created and assigned.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task, status) {
    try {
      await request(`/api/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      message(reload, 'Task status updated.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function removeTask(id) {
    if (!window.confirm('Delete this task?')) return;
    try {
      await request(`/api/tasks/${id}`, { method: 'DELETE' });
      message(reload, 'Task deleted.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function loadComments(taskId) {
    try {
      const rows = await request(`/api/tasks/${taskId}/comments`);
      setComments(current => ({ ...current, [taskId]: rows }));
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function addComment(event, taskId) {
    event.preventDefault();
    const content = commentDrafts[taskId]?.trim();
    if (!content) return;
    try {
      await request(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
      setCommentDrafts(current => ({ ...current, [taskId]: '' }));
      await loadComments(taskId);
      await reload();
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function markRead(notificationId) {
    try {
      await request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      await reload();
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function changeRole(user, newRole) {
    try {
      await request(`/api/admin/users/${user.id}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      message(reload, `${user.display_name}'s role updated.`);
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function createInvitation(event) {
    event.preventDefault();
    setInviteCode('');
    try {
      const invitation = await request('/api/admin/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail('');
      setInviteCode(invitation.invitation_code);
      setNotice(`Invitation created for ${invitation.email}. Share this code before it expires in seven days.`);
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function changeActivation(user) {
    try {
      await request(`/api/admin/users/${user.id}/active`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      message(reload, `${user.display_name}'s account ${user.is_active ? 'deactivated' : 'activated'}.`);
    } catch (cause) {
      setError(cause.message);
    }
  }

  const title = view === 'quizzes' ? 'Published quizzes' : view === 'tasks' ? 'My Tasks' : 'Management dashboard';

  return <section className={`panel workspace-panel${view === 'tasks' ? ' tasks-workspace' : ''}`}>
    <div className="section-heading">
      <div><span className="section-kicker">{view === 'tasks' ? 'YOUR WORK QUEUE' : 'FASTQUIZ WORKSPACE'}</span><h2>{view === 'quizzes' ? <BookOpen size={22}/> : view === 'tasks' ? <Check size={22}/> : <ShieldCheck size={22}/>} {title}</h2></div>
      <button className="text-button tasks-refresh" type="button" onClick={reload} disabled={busy} aria-label="Refresh tasks"><RefreshCw size={14} className={busy ? 'is-refreshing' : ''}/>{busy ? 'Refreshing' : 'Refresh'}</button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {notice && <div className="workspace-notice">{notice}</div>}

    {view === 'quizzes' && <>
      {!token && <div className="workspace-notice">Log in to start quizzes and save your scores. <button className="text-button" onClick={onLogin}>Log in</button></div>}
      {activeQuiz ? <div className="managed-quiz">
        <button className="text-button" onClick={() => { setActiveQuiz(null); setQuizResult(null); reload(); }}>← All quizzes</button>
        <h3>{activeQuiz.title}</h3><p>{activeQuiz.description}</p>
        {remainingSeconds !== null && <div className="workspace-notice"><Clock3 size={15}/> Time remaining: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</div>}
        {quizResult ? <div className="result-summary"><b>Score: {quizResult.score} / {quizResult.max_score}</b><p>Your answers have been recorded.</p></div>
          : <form onSubmit={submitQuiz}>
            {activeQuiz.questions.map((question, index) => <fieldset className="workspace-question" key={question.id}>
              <legend>{index + 1}. {question.title} <small>{question.points} points</small></legend>
              {question.options.map(option => <label className="workspace-choice" key={option.id}>
                <input type="radio" name={`question-${question.id}`} required
                  checked={Number(answers[question.id]) === option.id}
                  onChange={() => setAnswers(current => ({ ...current, [question.id]: option.id }))}/>
                {option.label}. {option.text}
              </label>)}
            </fieldset>)}
            {remainingSeconds === 0 && <p className="workspace-warning">The time limit has ended. Submit once to close the expired attempt.</p>}
            <button className="workspace-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit quiz'} <ArrowRight size={15}/></button>
          </form>}
      </div> : quizzes.length ? <div className="workspace-list">{quizzes.map(quiz => <article className="workspace-card" key={quiz.id}>
        <div><span className="workspace-tag">{quiz.category} · {quiz.difficulty}</span><h3>{quiz.title}</h3><p>{quiz.description}</p><small>{quiz.question_count} questions · {quiz.max_score} points{quiz.time_limit_seconds ? ` · ${Math.round(quiz.time_limit_seconds / 60)} min` : ''}</small></div>
        {quiz.has_attempted ? <b className="workspace-score">Completed · {quiz.attempt_score}/{quiz.max_score}</b> : <button className="workspace-primary" onClick={() => openQuiz(quiz.id)} disabled={busy}>Start quiz <ArrowRight size={15}/></button>}
      </article>)}</div> : <div className="workspace-empty">There are no published quizzes available yet.</div>}
      {!!attempts.length && <div className="workspace-subsection"><h3>Quiz history</h3>{attempts.map(attempt => <div className="workspace-row" key={attempt.id}><span>{attempt.quiz_title}</span><b>{attempt.score}/{attempt.max_score}</b><small>{new Date(attempt.submitted_at).toLocaleString()}</small></div>)}</div>}
    </>}

    {view === 'admin' && isAdmin && <>
      {report && <div className="workspace-metrics">
        <div><b>{quizzes.length}</b><span>quizzes</span></div>
        <div><b>{report.quiz_attempts}</b><span>quiz attempts</span></div>
        <div><b>{report.overdue_tasks}</b><span>overdue tasks</span></div>
        {Object.entries(report.task_counts || {}).map(([status, count]) => <div key={status}><b>{count}</b><span>{status.replaceAll('_', ' ').toLowerCase()}</span></div>)}
      </div>}
      {report?.quiz_participation?.length > 0 && <div className="workspace-subsection"><h3>Quiz participation</h3>{report.quiz_participation.map(item => <div className="workspace-row" key={item.quiz_id}><span>{item.title}</span><b>{item.attempts} submissions</b><small>{item.is_published ? 'Published' : 'Draft'}</small></div>)}</div>}
      {report?.member_progress?.length > 0 && <div className="workspace-subsection"><h3>Member task progress</h3>{report.member_progress.map(item => <div className="workspace-row" key={item.user_id}><span>{item.display_name}</span><b>{item.completed}/{item.assigned} completed</b></div>)}</div>}
      {report?.recent_activity?.length > 0 && <div className="workspace-subsection"><h3>Recent activity</h3>{report.recent_activity.map(item => <div className="workspace-row" key={item.id}><span>{item.entity_type} · {item.action}<small>{item.details}</small></span><small>{new Date(item.created_at).toLocaleString()}</small></div>)}</div>}

      <div className="workspace-subsection">
        <h3>{editingQuizId ? 'Edit quiz draft' : 'Create a quiz'}</h3>
        <form className="workspace-form" onSubmit={saveQuiz}>
          <label>Title<input required minLength="3" maxLength="200" value={quizForm.title} onChange={event => setQuizForm({ ...quizForm, title: event.target.value })}/></label>
          <label>Description<textarea maxLength="2000" value={quizForm.description} onChange={event => setQuizForm({ ...quizForm, description: event.target.value })}/></label>
          <div className="workspace-form-grid">
            <label>Category<input required value={quizForm.category} onChange={event => setQuizForm({ ...quizForm, category: event.target.value })}/></label>
            <label>Difficulty<select value={quizForm.difficulty} onChange={event => setQuizForm({ ...quizForm, difficulty: event.target.value })}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label>
            <label>Time limit (seconds)<input type="number" min="30" max="86400" value={quizForm.time_limit_seconds} onChange={event => setQuizForm({ ...quizForm, time_limit_seconds: event.target.value })}/></label>
            <label>Available from<input type="datetime-local" value={quizForm.available_at} onChange={event => setQuizForm({ ...quizForm, available_at: event.target.value })}/></label>
            <label>Closes at<input type="datetime-local" value={quizForm.closes_at} onChange={event => setQuizForm({ ...quizForm, closes_at: event.target.value })}/></label>
          </div>
          {quizForm.questions.map((question, questionIndex) => <fieldset className="workspace-editor-question" key={questionIndex}>
            <legend>Question {questionIndex + 1}</legend>
            <label>Question<input required minLength="3" maxLength="500" value={question.title} onChange={event => updateQuestion(questionIndex, 'title', event.target.value)}/></label>
            <label>Explanation<textarea maxLength="1000" value={question.explanation} onChange={event => updateQuestion(questionIndex, 'explanation', event.target.value)}/></label>
            <label>Points<input type="number" min="1" max="1000" value={question.points} onChange={event => updateQuestion(questionIndex, 'points', event.target.value)}/></label>
            <div className="workspace-options">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<input required maxLength="300" value={option} onChange={event => updateOption(questionIndex, optionIndex, event.target.value)}/></label>)}</div>
            <label>Correct answer<select value={question.correct_option_index} onChange={event => updateQuestion(questionIndex, 'correct_option_index', Number(event.target.value))}>{question.options.map((option, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)} — {option || 'Enter option text'}</option>)}</select></label>
            <div className="workspace-buttons">
              {question.options.length < 8 && <button type="button" className="text-button" onClick={() => updateQuestion(questionIndex, 'options', [...question.options, ''])}><Plus size={14}/> Add answer</button>}
              {question.options.length > 2 && <button type="button" className="text-button" onClick={() => setQuizForm(current => ({ ...current, questions: current.questions.map((item, index) => index === questionIndex ? { ...item, options: item.options.slice(0, -1), correct_option_index: Math.min(item.correct_option_index, item.options.length - 2) } : item) }))}><Trash2 size={14}/> Remove last answer</button>}
              {quizForm.questions.length > 1 && <button type="button" className="text-button danger-button" onClick={() => setQuizForm(current => ({ ...current, questions: current.questions.filter((_, index) => index !== questionIndex) }))}><Trash2 size={14}/> Remove question</button>}
            </div>
          </fieldset>)}
          {!editingQuizId && <button type="button" className="text-button" onClick={() => setQuizForm(current => ({ ...current, questions: [...current.questions, emptyQuestion()] }))}><Plus size={14}/> Add question</button>}
          <div className="workspace-buttons"><button className="workspace-primary" disabled={busy}>{editingQuizId ? 'Save draft' : 'Create draft'} <ArrowRight size={15}/></button>{editingQuizId && <button type="button" className="text-button" onClick={() => { setEditingQuizId(null); setQuizForm(emptyQuiz()); }}>Cancel edit</button>}</div>
        </form>
      </div>

      <div className="workspace-subsection"><h3>Quizzes</h3>
        {quizzes.map(quiz => <article className="workspace-card" key={quiz.id}>
          <div><span className={`workspace-tag ${quiz.is_published ? 'published' : ''}`}>{quiz.is_published ? 'PUBLISHED' : 'DRAFT'}</span><h3>{quiz.title}</h3><small>{quiz.question_count} questions · {quiz.max_score} points · {quiz.attempt_count} submissions</small></div>
          <div className="workspace-buttons">
            <button className="text-button" onClick={() => editQuiz(quiz.id)}>Edit</button>
            <button className="text-button" onClick={() => showAttempts(quiz.id)}>Results</button>
            <button className="text-button" onClick={() => setPublished(quiz)}>{quiz.is_published ? 'Unpublish' : 'Publish'}</button>
            {quiz.winner_announced
              ? <span className="workspace-tag published">WINNER ANNOUNCED</span>
              : quiz.is_published && <button className="text-button" onClick={() => publishWinnerAnnouncement(quiz)} disabled={busy}>Close &amp; publish winner</button>}
            {!quiz.has_attempted && <button className="text-button danger-button" onClick={() => deleteQuiz(quiz.id)}><Trash2 size={14}/></button>}
          </div>
        </article>)}
        {!!attempts.length && <div className="workspace-subsection"><h4>Quiz attempts / results</h4>{attempts.map(attempt => <div className="workspace-row" key={attempt.id}><span>{attempt.user?.display_name || attempt.quiz_title || `User #${attempt.user_id}`}</span><b>{attempt.score}/{attempt.max_score}</b><small>{new Date(attempt.submitted_at).toLocaleString()}</small></div>)}</div>}
      </div>

      <div className="workspace-subsection"><h3>{editingTaskId ? 'Edit task' : 'Create and assign task'}</h3>
        <form className="workspace-form" onSubmit={saveTask}>
          <label>Title<input required minLength="3" maxLength="200" value={taskForm.title} onChange={event => setTaskForm({ ...taskForm, title: event.target.value })}/></label>
          <label>Description<textarea value={taskForm.description} onChange={event => setTaskForm({ ...taskForm, description: event.target.value })}/></label>
          <div className="workspace-form-grid">
            <label>Project<input value={taskForm.project} onChange={event => setTaskForm({ ...taskForm, project: event.target.value })}/></label>
            <label>Requirements<textarea maxLength="10000" value={taskForm.requirements} onChange={event => setTaskForm({ ...taskForm, requirements: event.target.value })}/></label>
            <label>Difficulty<select value={taskForm.difficulty} onChange={event => setTaskForm({ ...taskForm, difficulty: event.target.value })}><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select></label>
            <label>Publication status<select value={String(taskForm.is_published)} onChange={event => setTaskForm({ ...taskForm, is_published: event.target.value === 'true' })}><option value="true">PUBLISHED</option><option value="false">DRAFT</option></select></label>
            <label>Priority<select value={taskForm.priority} onChange={event => setTaskForm({ ...taskForm, priority: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label>
            <label>Status<select value={taskForm.status} onChange={event => setTaskForm({ ...taskForm, status: event.target.value })}>{taskStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
            <label>Deadline<input type="datetime-local" value={taskForm.deadline} onChange={event => setTaskForm({ ...taskForm, deadline: event.target.value })}/></label>
            <label>Assignee<select value={taskForm.assignee_id} onChange={event => setTaskForm({ ...taskForm, assignee_id: event.target.value })}><option value="">Unassigned</option>{users.map(item => <option key={item.id} value={item.id}>{item.display_name} · {item.role}</option>)}</select></label>
          </div>
          <div className="workspace-buttons"><button className="workspace-primary" disabled={busy}>{editingTaskId ? 'Save task' : 'Create task'} <ArrowRight size={15}/></button>{editingTaskId && <button type="button" className="text-button" onClick={() => { setEditingTaskId(null); setTaskForm(emptyTask()); }}>Cancel edit</button>}</div>
        </form>
      </div>

      {isAdmin && <div className="workspace-subsection"><h3><Users size={18}/> Invite a member</h3>
        <form className="workspace-form" onSubmit={createInvitation}>
          <label>Email address<input required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="member@example.com"/></label>
          <button className="workspace-primary">Create invitation <ArrowRight size={15}/></button>
        </form>
        {inviteCode && <div className="workspace-notice"><b>One-time invitation code</b><code>{inviteCode}</code><small>Share it securely with the invited person. It is stored as a hash and expires in seven days.</small></div>}
      </div>}
      {isSuperAdmin && <div className="workspace-subsection"><h3><Users size={18}/> Accounts and roles</h3>{users.map(item => <div className="workspace-row" key={item.id}><span>{item.display_name} · {item.email}<small>{item.is_active ? 'Active' : 'Inactive'}</small></span><select aria-label={`Role for ${item.email}`} value={item.role} onChange={event => changeRole(item, event.target.value)}><option>MEMBER</option><option>ADMIN</option><option>SUPER_ADMIN</option></select><button className="text-button" onClick={() => changeActivation(item)}>{item.is_active ? 'Deactivate' : 'Activate'}</button></div>)}</div>}
    </>}

    {view === 'tasks' && !token ? <div className="workspace-empty tasks-auth-empty">
      <ShieldCheck size={28}/>
      <b>Sign in to view your tasks</b>
      <span>Your assigned work, notifications, and quiz progress are available after you sign in.</span>
      <button className="workspace-primary" onClick={onLogin}>Log in <ArrowRight size={15}/></button>
    </div> : (view === 'tasks' || view === 'admin') && <>
      {view === 'tasks' && <form className="workspace-filter tasks-search" onSubmit={event => { event.preventDefault(); reload(); }}>
        <label className="tasks-search-field"><Search size={16}/><input type="search" aria-label="Search tasks" placeholder="Search assigned tasks" value={filter} onChange={event => setFilter(event.target.value)}/></label>
        <button className="workspace-primary" type="submit" disabled={busy}><Search size={15}/>Search</button>
      </form>}
      {view === 'tasks' && taskError && <div className="global-error task-load-error" role="alert"><b>Tasks could not be loaded.</b> {taskError}</div>}
      {view === 'tasks' && taskDetailsError && <div className="global-error task-details-error" role="alert">Tasks loaded, but some dashboard details could not be loaded. {taskDetailsError}</div>}
      {notifications.length > 0 && <div className="workspace-subsection"><h3><Bell size={17}/> Notifications</h3>{notifications.map(item => <div className={`workspace-row ${item.read_at ? 'read-row' : ''}`} key={item.id}><span><b>{item.title}</b><small>{item.message}</small></span>{!item.read_at && <button className="text-button" onClick={() => markRead(item.id)}>Mark read</button>}</div>)}</div>}
      <div className={`workspace-subsection${view === 'tasks' ? ' tasks-assigned-list' : ''}`}><h3>{view === 'tasks' ? 'Assigned tasks' : 'All tasks'}</h3>{view === 'tasks' && taskError ? <div className="workspace-empty" role="status">Use Refresh to try again.</div> : view === 'admin' && error ? <div className="workspace-empty"><b>Tasks could not be loaded.</b><span>Use Refresh to try again.</span></div> : busy && !tasks.length ? <div className="workspace-empty" role="status">Loading assigned tasks…</div> : tasks.length ? tasks.map(task => <article className="workspace-card task-card" key={task.id}>
        <div><span className="workspace-tag">{task.difficulty} · {task.priority} · {task.project || 'General'} · {task.is_published ? 'PUBLISHED' : 'DRAFT'}</span><h3>{task.title}</h3><p>{task.description}</p>{task.requirements && <p><b>Requirements:</b> {task.requirements}</p>}<small>{task.assignee?.display_name ? `Assigned to ${task.assignee.display_name} · ` : ''}Due {task.deadline ? new Date(task.deadline).toLocaleString() : 'no deadline'}</small></div>
        <div className="workspace-buttons">
          <select aria-label={`Status for ${task.title}`} value={task.status} onChange={event => changeStatus(task, event.target.value)}>{taskStatuses.map(status => <option key={status}>{status}</option>)}</select>
          {isAdmin && <button className="text-button" onClick={() => { setTaskForm({ title: task.title, description: task.description, priority: task.priority, status: task.status, project: task.project || '', requirements: task.requirements || '', difficulty: task.difficulty || 'BEGINNER', is_published: task.is_published, deadline: task.deadline ? task.deadline.slice(0, 16) : '', assignee_id: task.assignee?.id || '' }); setEditingTaskId(task.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>}
          <button className="text-button" onClick={() => comments[task.id] ? setComments(current => ({ ...current, [task.id]: null })) : loadComments(task.id)}>Comments</button>
          {isAdmin && <button className="text-button danger-button" onClick={() => removeTask(task.id)}><Trash2 size={14}/></button>}
        </div>
        {comments[task.id] && <div className="workspace-comments">
          {comments[task.id].map(comment => <p key={comment.id}><b>{comment.author}</b> {comment.content}</p>)}
          <form onSubmit={event => addComment(event, task.id)}><input required maxLength="2000" placeholder="Progress update or comment" value={commentDrafts[task.id] || ''} onChange={event => setCommentDrafts(current => ({ ...current, [task.id]: event.target.value }))}/><button className="workspace-primary">Post update</button></form>
        </div>}
      </article>) : <div className="workspace-empty tasks-empty-state"><Check size={22}/><b>{filter.trim() ? 'No tasks match this search.' : 'No tasks have been assigned yet.'}</b><span>{filter.trim() ? 'Try changing your search or clear it to see all assigned tasks.' : view === 'admin' ? 'Create or assign tasks from Manage to make them available here.' : 'Your tasks will appear here when an administrator assigns them to you.'}</span></div>}</div>
    </>}
    {view === 'tasks' && token && <div className="workspace-subsection tasks-quiz-progress"><h3>Quiz progress</h3>{taskDetailsError.includes('Quiz progress:') && !attempts.length ? <div className="workspace-empty">Quiz progress is temporarily unavailable.</div> : attempts.length ? attempts.map(attempt => <div className="workspace-row" key={attempt.id}><span>{attempt.quiz_title}</span><b>{attempt.score}/{attempt.max_score}</b><small>{new Date(attempt.submitted_at).toLocaleString()}</small></div>) : <div className="workspace-empty">No submitted quiz results yet. Completed quizzes will appear here.</div>}</div>}
  </section>;
}
