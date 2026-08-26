const liveGrid = document.getElementById('live-grid');
const upcomingGrid = document.getElementById('upcoming-grid');
const pastGrid = document.getElementById('past-grid');
const liveSection = document.getElementById('live-section');
const pastSection = document.getElementById('past-section');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function cardHTML(c) {
  const badge = c.status === 'live' ? 'live' : c.status === 'ended' ? 'ended' : 'scheduled';
  const label = c.status === 'live' ? '● Live now' : c.status === 'ended'
    ? (c.recording_url ? 'Recording available' : 'Ended')
    : 'Scheduled';
  const clickable = c.status !== 'ended' || !!c.recording_url;
  return `
    <a class="class-card${clickable ? '' : ' disabled'}" href="${clickable ? `class.html?id=${c.id}` : '#'}">
      <span class="badge ${badge}">${label}</span>
      <h3>${escapeHtml(c.title)}</h3>
      <div class="class-meta">with ${escapeHtml(c.instructor)}</div>
      <div class="class-meta">${fmtTime(c.scheduled_at)} · ${c.duration_minutes} min</div>
    </a>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function loadClasses() {
  const { data, error } = await sb
    .from('classes')
    .select('*')
    .order('scheduled_at', { ascending: true });

  if (error) {
    liveGrid.innerHTML = upcomingGrid.innerHTML = `<p>Couldn't load classes.</p>`;
    console.error(error);
    return;
  }

  const live = data.filter(c => c.status === 'live');
  const upcoming = data.filter(c => c.status === 'scheduled');
  const ended = data.filter(c => c.status === 'ended').slice(-6).reverse();

  liveSection.style.display = live.length ? '' : 'none';
  liveGrid.innerHTML = live.map(cardHTML).join('') || '';
  upcomingGrid.innerHTML = upcoming.map(cardHTML).join('') || `<p>No upcoming classes yet.</p>`;
  pastSection.style.display = ended.length ? '' : 'none';
  pastGrid.innerHTML = ended.map(cardHTML).join('');
}

logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = 'index.html';
});

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  const meta = session.user.user_metadata || {};
  userName.textContent = meta.full_name || session.user.email;
  userAvatar.src = meta.avatar_url || meta.picture || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(session.user.email);

  await loadClasses();

  sb
    .channel('classes-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, loadClasses)
    .subscribe();
})();
