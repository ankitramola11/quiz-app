/**
 * Shared Admin JavaScript
 * IEEE SRHU Student Branch Quiz App
 */

const ADMIN_TOKEN = localStorage.getItem('token');
const ADMIN_USER  = JSON.parse(localStorage.getItem('user') || 'null');

// Guard: must be admin
if (!ADMIN_TOKEN || !ADMIN_USER || ADMIN_USER.role !== 'admin') {
  window.location.href = '/admin/login.html';
}

function adminLogout() {
  localStorage.clear();
  window.location.href = '/admin/login.html';
}

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ADMIN_TOKEN,
      ...(options.headers || {})
    }
  });
}

function showToast(message, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = `show ${type}`;
  t.style.display = 'flex';
  setTimeout(() => { t.className = ''; t.style.display = 'none'; }, 3500);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function highlightActive(href) {
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === href);
  });
}

// Sidebar + Navbar template
function renderAdminShell() {
  const currentPath = window.location.pathname.split('/').pop();

  const sidebarHtml = `
  <nav class="navbar">
    <div class="container" style="max-width:100%; padding:0 1.5rem;">
      <a href="/admin/dashboard.html" class="navbar-brand">
        <img src="/images/logo.png" class="logo-icon" alt="IEEE SRHU Logo" />
        <div><span>IEEE Admin</span><small>SRHU Student Branch Quiz</small></div>
      </a>
      <div class="navbar-links">
        <span style="font-size:0.875rem; color:var(--text-secondary);">👤 ${ADMIN_USER.name}</span>
        <button onclick="adminLogout()" class="btn btn-outline btn-sm">Logout</button>
      </div>
    </div>
  </nav>
  `;

  const sidebarNav = `
  <div class="admin-sidebar">
    <div class="sidebar-profile">
      <div class="sp-avatar">A</div>
      <div class="sp-name">${ADMIN_USER.name}</div>
      <div class="sp-role">Admin</div>
    </div>
    <ul class="sidebar-nav">
      <li class="nav-divider">Overview</li>
      <li><a href="/admin/dashboard.html"    class="${currentPath==='dashboard.html'?'active':''}"><span class="nav-icon">📊</span> Dashboard</a></li>
      <li class="nav-divider">Management</li>
      <li><a href="/admin/questions.html"    class="${currentPath==='questions.html'?'active':''}"><span class="nav-icon">❓</span> Questions</a></li>
      <li><a href="/admin/quizzes.html"      class="${currentPath==='quizzes.html'?'active':''}"><span class="nav-icon">📝</span> Quizzes</a></li>
      <li><a href="/admin/participants.html" class="${currentPath==='participants.html'?'active':''}"><span class="nav-icon">👥</span> Participants</a></li>
      <li><a href="/admin/results.html"      class="${currentPath==='results.html'?'active':''}"><span class="nav-icon">🏆</span> Results</a></li>
      <li class="nav-divider">System</li>
      <li><a href="#" onclick="adminLogout()"><span class="nav-icon">🚪</span> Logout</a></li>
    </ul>
  </div>
  `;

  // Insert navbar at body start
  document.body.insertAdjacentHTML('afterbegin', sidebarHtml);

  // Insert sidebar into layout
  const sidebar = document.getElementById('admin-sidebar-slot');
  if (sidebar) sidebar.innerHTML = sidebarNav;
}
