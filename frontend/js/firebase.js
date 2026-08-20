// Firebase Analytics – IEEE SRHU Quiz App
// Wrapped in try/catch so analytics failures NEVER break the core quiz flow

let analytics = null;

const firebaseConfig = {
  apiKey: "AIzaSyCHvzjuMjBa41NGIBIYREzLl9-DpsBxzOI",
  authDomain: "quiz-app-2ba3d.firebaseapp.com",
  projectId: "quiz-app-2ba3d",
  storageBucket: "quiz-app-2ba3d.firebasestorage.app",
  messagingSenderId: "863862448313",
  appId: "1:863862448313:web:515957d0ca049a3481bb68",
  measurementId: "G-S5NPT5F9VL"
};

// Stub functions (used as fallback if Firebase fails to load)
const noop = () => {};
let _trackPageView = noop;
let _trackLogin = noop;
let _trackQuizStart = noop;
let _trackQuizSubmit = noop;
let _trackRegister = noop;

// Async init — does NOT block page load
(async () => {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getAnalytics, logEvent } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js");

    const app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);

    _trackPageView  = (p)      => logEvent(analytics, 'page_view',    { page_title: p });
    _trackLogin     = (m='email') => logEvent(analytics, 'login',     { method: m });
    _trackQuizStart = (id, t)  => logEvent(analytics, 'quiz_start',   { quiz_id: id, quiz_title: t });
    _trackQuizSubmit= (id,s,t) => logEvent(analytics, 'quiz_submit',  { quiz_id: id, score: s, total_marks: t, percentage: Math.round((s/t)*100) });
    _trackRegister  = ()       => logEvent(analytics, 'sign_up',      { method: 'email' });
  } catch (e) {
    // Analytics blocked or unavailable — core app continues normally
    console.warn('[Analytics] Firebase unavailable:', e.message);
  }
})();

export const trackPageView   = (...a) => _trackPageView(...a);
export const trackLogin      = (...a) => _trackLogin(...a);
export const trackQuizStart  = (...a) => _trackQuizStart(...a);
export const trackQuizSubmit = (...a) => _trackQuizSubmit(...a);
export const trackRegister   = (...a) => _trackRegister(...a);
