// Firebase Configuration – IEEE SRHU Quiz App
// Uses Firebase CDN (ES Modules) – no bundler required

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHvzjuMjBa41NGIBIYREzLl9-DpsBxzOI",
  authDomain: "quiz-app-2ba3d.firebaseapp.com",
  projectId: "quiz-app-2ba3d",
  storageBucket: "quiz-app-2ba3d.firebasestorage.app",
  messagingSenderId: "863862448313",
  appId: "1:863862448313:web:515957d0ca049a3481bb68",
  measurementId: "G-S5NPT5F9VL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics
export const analytics = getAnalytics(app);

// Firestore
export const db = getFirestore(app);

// ─── Analytics Helper Functions ──────────────────────────────────
// Call these from any page to track events

export function trackPageView(pageName) {
  logEvent(analytics, 'page_view', { page_title: pageName });
}

export function trackLogin(method = 'email') {
  logEvent(analytics, 'login', { method });
}

export function trackQuizStart(quizId, quizTitle) {
  logEvent(analytics, 'quiz_start', { quiz_id: quizId, quiz_title: quizTitle });
}

export function trackQuizSubmit(quizId, score, totalMarks) {
  logEvent(analytics, 'quiz_submit', {
    quiz_id: quizId,
    score: score,
    total_marks: totalMarks,
    percentage: Math.round((score / totalMarks) * 100)
  });
}

export function trackRegister() {
  logEvent(analytics, 'sign_up', { method: 'email' });
}
