/**
 * Quiz Screen JavaScript
 * IEEE SRHU Student Branch Aptitude Quiz App
 *
 * Handles: question loading, answer saving, timer, navigation,
 * palette coloring, review marking, and submission.
 */

import { trackQuizStart, trackQuizSubmit, trackPageView } from '/js/firebase.js';
trackPageView('Quiz Page');

// ─── Auth Guard ──────────────────────────────────────────────
const TOKEN     = localStorage.getItem('token');
const USER      = JSON.parse(localStorage.getItem('user')     || 'null');
const ATTEMPT_ID = localStorage.getItem('attemptId');
const QUIZ_ID    = localStorage.getItem('quizId');
const STARTED_AT = localStorage.getItem('startedAt');
const DURATION   = parseInt(localStorage.getItem('duration'), 10);

if (!TOKEN || !USER || !ATTEMPT_ID) window.location.href = '/login.html';

// ─── State ───────────────────────────────────────────────────
let questions      = [];
let currentIndex   = 0;
let answers        = {};   // { questionId: selectedOptionIndex | null }
let reviewStatus   = {};   // { questionId: true/false }
let visitedStatus  = {};   // { questionId: true/false }
let timerInterval  = null;
let isSubmitting   = false;

// ─── DOM Refs ────────────────────────────────────────────────
const timerDisplay  = document.getElementById('timer-display');
const timerBox      = document.getElementById('timer-box');
const questionText  = document.getElementById('question-text');
const optionsList   = document.getElementById('options-list');
const paletteGrid   = document.getElementById('palette-grid');
const qNum          = document.getElementById('q-num');
const qTotal        = document.getElementById('q-total');
const progressFill  = document.getElementById('progress-fill');
const progressText  = document.getElementById('progress-text');
const progressPct   = document.getElementById('progress-pct');
const qNumberBadge  = document.getElementById('q-number-badge');
const diffBadge     = document.getElementById('diff-badge');
const qCatBadge     = document.getElementById('q-category-badge');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');

// ─── Disable Right-Click & Text Select ───────────────────────
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());

// ─── Warn Before Unload ───────────────────────────────────────
window.addEventListener('beforeunload', e => {
  if (!isSubmitting) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ─── Tab Switch / Visibility Detection ───────────────────────
let tabSwitchCount = 0;
const MAX_TAB_SWITCHES = 1; // auto-submit on first switch

function showTabWarning(msg) {
  // Create or update warning overlay
  let overlay = document.getElementById('tab-warning-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tab-warning-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.92);
      z-index:9999; display:flex; flex-direction:column;
      align-items:center; justify-content:center; text-align:center;
      padding:2rem; backdrop-filter:blur(8px);
    `;
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="font-size:3rem; margin-bottom:1rem;">🚫</div>
    <h2 style="color:#ef4444; font-size:1.5rem; margin-bottom:0.75rem; font-family:Inter,sans-serif;">Tab Switch Detected!</h2>
    <p style="color:#cbd5e1; font-size:1rem; max-width:400px; margin-bottom:1.5rem; font-family:Inter,sans-serif;">${msg}</p>
    <div style="color:#f59e0b; font-size:2rem; font-weight:800; font-family:Inter,sans-serif;" id="tab-countdown"></div>
  `;
  overlay.style.display = 'flex';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isSubmitting && questions.length > 0) {
    tabSwitchCount++;
    if (tabSwitchCount >= MAX_TAB_SWITCHES) {
      // Auto-submit immediately
      isSubmitting = true;
      clearInterval(timerInterval);
      showTabWarning('You switched tabs. Your quiz is being submitted automatically.');
      let count = 3;
      const cd = () => {
        const el = document.getElementById('tab-countdown');
        if (el) el.textContent = `Submitting in ${count}...`;
        if (count <= 0) {
          doSubmit('tab-switch');
        } else {
          count--;
          setTimeout(cd, 1000);
        }
      };
      cd();
    }
  }
});

window.addEventListener('blur', () => {
  if (!isSubmitting && questions.length > 0) {
    tabSwitchCount++;
    if (tabSwitchCount >= MAX_TAB_SWITCHES) {
      isSubmitting = true;
      clearInterval(timerInterval);
      showTabWarning('You left the quiz window. Your quiz is being submitted automatically.');
      let count = 3;
      const cd = () => {
        const el = document.getElementById('tab-countdown');
        if (el) el.textContent = `Submitting in ${count}...`;
        if (count <= 0) {
          doSubmit('tab-switch');
        } else {
          count--;
          setTimeout(cd, 1000);
        }
      };
      cd();
    }
  }
});


// ─── Timer ───────────────────────────────────────────────────
function startTimer() {
  const endTime = new Date(STARTED_AT).getTime() + DURATION * 60 * 1000;

  function tick() {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerDisplay.textContent = '00:00';
      timerBox.classList.add('danger');
      autoSubmit();
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerDisplay.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    if (remaining < 5 * 60 * 1000) {
      timerBox.classList.remove('warning');
      timerBox.classList.add('danger');
    } else if (remaining < 10 * 60 * 1000) {
      timerBox.classList.add('warning');
    }
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

// ─── Auto Submit ─────────────────────────────────────────────
async function autoSubmit() {
  if (isSubmitting) return;
  isSubmitting = true;
  await doSubmit('timed-out');
}

// ─── Load Questions ───────────────────────────────────────────
async function loadQuestions() {
  try {
    const res  = await fetch(`https://ieee-quiz-c3u1.onrender.com/api/quizzes/${QUIZ_ID}/questions`, {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const data = await res.json();

    if (!data.success) {
      questionText.textContent = data.message || 'Failed to load questions.';
      return;
    }

    questions = data.questions;

    // Restore saved answers
    if (data.savedAnswers) {
      data.savedAnswers.forEach(a => {
        if (a.selectedOptionIndex !== null && a.selectedOptionIndex !== undefined) {
          answers[a.questionId] = a.selectedOptionIndex;
        }
      });
    }

    document.getElementById('quiz-title-nav').textContent = data.questions[0]?.quizId?.title || 'IEEE SRH Quiz';
    qTotal.textContent = questions.length;

    // Sidebar info
    document.getElementById('side-name').textContent  = USER.name;
    document.getElementById('side-meta').textContent  = `${USER.enrollmentNo} · ${USER.course}`;

    buildPalette();
    renderQuestion(0);
    startTimer();

  } catch (err) {
    questionText.textContent = 'Connection error. Please refresh.';
  }
}

// ─── Render Question ─────────────────────────────────────────
function renderQuestion(idx) {
  if (idx < 0 || idx >= questions.length) return;
  currentIndex = idx;

  const q = questions[idx];
  visitedStatus[q._id] = true;

  qNum.textContent          = idx + 1;
  qNumberBadge.textContent  = `Q${idx + 1}`;
  questionText.textContent  = q.questionText;

  // Category + Difficulty badges
  if (q.category) { qCatBadge.textContent = q.category; qCatBadge.style.display = 'inline-flex'; }
  if (q.difficulty) {
    diffBadge.textContent = q.difficulty;
    diffBadge.style.display = 'inline-flex';
    diffBadge.className = 'badge ' + (q.difficulty === 'Easy' ? 'badge-green' : q.difficulty === 'Hard' ? 'badge-red' : 'badge-yellow');
  }

  // Render options
  optionsList.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const li = document.createElement('li');
    li.className = 'option-item' + (answers[q._id] === i ? ' selected' : '');
    li.id = `opt-${i}`;
    li.innerHTML = `<span class="option-letter">${letters[i]}</span><span class="option-text">${opt}</span>`;
    li.addEventListener('click', () => selectAnswer(q._id, i, li));
    optionsList.appendChild(li);
  });

  // Nav buttons
  btnPrev.disabled = idx === 0;
  btnNext.textContent = idx === questions.length - 1 ? '✅ Finish' : 'Save & Next →';

  updateProgress();
  updatePalette();
  updateSummary();
  updateReviewBtn();

  // Scroll question to top
  document.querySelector('.quiz-main').scrollTop = 0;
}

// ─── Select Answer ────────────────────────────────────────────
async function selectAnswer(questionId, optionIndex, li) {
  // Update UI
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  li.classList.add('selected');
  li.querySelector('.option-letter').style.background = 'var(--blue)';
  li.querySelector('.option-letter').style.color = '#fff';

  answers[questionId] = optionIndex;
  updatePalette();
  updateProgress();
  updateSummary();

  // Save to server (non-blocking)
  try {
    await fetch(`https://ieee-quiz-c3u1.onrender.com/api/attempts/${ATTEMPT_ID}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN
      },
      body: JSON.stringify({ questionId, selectedOptionIndex: optionIndex })
    });
  } catch {}
}

// ─── Clear Answer ─────────────────────────────────────────────
async function clearAnswer() {
  const q = questions[currentIndex];
  if (!q) return;

  delete answers[q._id];
  document.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));

  updatePalette();
  updateProgress();
  updateSummary();

  try {
    await fetch(`https://ieee-quiz-c3u1.onrender.com/api/attempts/${ATTEMPT_ID}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN
      },
      body: JSON.stringify({ questionId: q._id, selectedOptionIndex: null })
    });
  } catch {}
}

// ─── Mark for Review ─────────────────────────────────────────
function toggleReview() {
  const q = questions[currentIndex];
  if (!q) return;
  reviewStatus[q._id] = !reviewStatus[q._id];
  updatePalette();
  updateSummary();
  updateReviewBtn();
}

function updateReviewBtn() {
  const q = questions[currentIndex];
  const btn = document.getElementById('btn-review');
  if (!q) return;
  const isReview = reviewStatus[q._id];
  btn.style.background     = isReview ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.15)';
  btn.style.borderColor    = 'rgba(245,158,11,0.4)';
  btn.textContent          = isReview ? '★ Unmark Review' : '★ Mark Review';
}

// ─── Navigate ────────────────────────────────────────────────
function navigate(dir) {
  const newIdx = currentIndex + dir;
  if (newIdx >= 0 && newIdx < questions.length) {
    renderQuestion(newIdx);
  } else if (newIdx >= questions.length) {
    openSubmitModal();
  }
}

// ─── Build Palette ────────────────────────────────────────────
function buildPalette() {
  paletteGrid.innerHTML = '';
  questions.forEach((q, i) => {
    const btn = document.createElement('button');
    btn.className = 'pal-btn';
    btn.id = `pal-${q._id}`;
    btn.textContent = i + 1;
    btn.onclick = () => renderQuestion(i);
    paletteGrid.appendChild(btn);
  });
}

// ─── Update Palette ───────────────────────────────────────────
function updatePalette() {
  const curQ = questions[currentIndex];
  questions.forEach(q => {
    const btn = document.getElementById(`pal-${q._id}`);
    if (!btn) return;

    const isAnswered = answers[q._id] !== undefined;
    const isReview   = reviewStatus[q._id];
    const isVisited  = visitedStatus[q._id];

    btn.className = 'pal-btn';
    if (q._id === curQ?._id)     btn.classList.add('active-q');
    if (isAnswered && isReview)   btn.classList.add('ans-review');
    else if (isAnswered)          btn.classList.add('answered');
    else if (isReview)            btn.classList.add('review');
    else if (isVisited)           btn.classList.add('not-ans');
  });
}

// ─── Progress Bar ────────────────────────────────────────────
function updateProgress() {
  const answered = Object.keys(answers).length;
  const total    = questions.length;
  const pct      = total ? Math.round((answered / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  progressText.textContent  = `${answered} answered`;
  progressPct.textContent   = pct + '%';
}

// ─── Sidebar Summary ─────────────────────────────────────────
function updateSummary() {
  const total    = questions.length;
  const answered = questions.filter(q => answers[q._id] !== undefined).length;
  const reviewed = questions.filter(q => reviewStatus[q._id]).length;
  const visited  = questions.filter(q => visitedStatus[q._id]).length;
  const notAns   = questions.filter(q => visitedStatus[q._id] && answers[q._id] === undefined).length;
  const notVis   = total - visited;

  document.getElementById('sum-ans').textContent = answered;
  document.getElementById('sum-not').textContent = notAns;
  document.getElementById('sum-rev').textContent = reviewed;
  document.getElementById('sum-nv').textContent  = notVis;
}

// ─── Submit Modal ─────────────────────────────────────────────
function openSubmitModal() {
  const total    = questions.length;
  const answered = questions.filter(q => answers[q._id] !== undefined).length;
  const unattempted = total - answered;
  const reviewed = questions.filter(q => reviewStatus[q._id]).length;

  const statsHtml = `
    <div class="modal-stat"><div class="ms-val text-green">${answered}</div><div class="ms-lbl">Answered</div></div>
    <div class="modal-stat"><div class="ms-val text-red">${unattempted}</div><div class="ms-lbl">Unattempted</div></div>
    <div class="modal-stat"><div class="ms-val" style="color:var(--yellow)">${reviewed}</div><div class="ms-lbl">In Review</div></div>
    <div class="modal-stat"><div class="ms-val">${total}</div><div class="ms-lbl">Total</div></div>
  `;

  document.getElementById('modal-stats').innerHTML = statsHtml;

  let alertHtml = '';
  if (unattempted > 0) {
    alertHtml = `<div class="alert alert-warning">⚠️ ${unattempted} question(s) are unattempted. They will carry 0 marks.</div>`;
  }
  if (reviewed > 0) {
    alertHtml += `<div class="alert alert-info" style="margin-top:0.5rem;">ℹ️ ${reviewed} question(s) are marked for review. Your saved answers will still count.</div>`;
  }
  document.getElementById('modal-alert').innerHTML = alertHtml;

  document.getElementById('submit-modal').classList.add('show');
}

function closeSubmitModal() {
  document.getElementById('submit-modal').classList.remove('show');
}

// ─── Submit Quiz ─────────────────────────────────────────────
async function submitQuiz() {
  if (isSubmitting) return;
  isSubmitting = true;
  clearInterval(timerInterval);

  const btn = document.getElementById('confirm-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting...';

  await doSubmit('completed');
}

async function doSubmit(reason) {
  try {
    const res  = await fetch(`https://ieee-quiz-c3u1.onrender.com/api/attempts/${ATTEMPT_ID}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN
      }
    });
    const data = await res.json();

    if (data.success) {
      trackQuizSubmit(QUIZ_ID, data.attempt?.score ?? 0, data.attempt?.totalMarks ?? 0);
      window.location.href = `/result.html?attemptId=${ATTEMPT_ID}`;
    } else {
      isSubmitting = false;
      const btn = document.getElementById('confirm-submit-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Now'; }
      document.getElementById('modal-alert').innerHTML = `<div class="alert alert-error">❌ ${data.message}</div>`;
    }
  } catch {
    isSubmitting = false;
    const btn = document.getElementById('confirm-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Now'; }
    document.getElementById('modal-alert').innerHTML = `<div class="alert alert-error">❌ Connection error. Please try again.</div>`;
  }
}

// ─── Init ────────────────────────────────────────────────────
loadQuestions();
