const createForm = document.getElementById('create-form');
const createMsg = document.getElementById('create-msg');
const manageList = document.getElementById('manage-list');
const rowTemplate = document.getElementById('row-template');

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById('c-title').value.trim(),
    instructor: document.getElementById('c-instructor').value.trim(),
    description: document.getElementById('c-desc').value.trim() || null,
    scheduled_at: new Date(document.getElementById('c-time').value).toISOString(),
    duration_minutes: Number(document.getElementById('c-duration').value) || 60,
    status: 'scheduled'
  };
  const { error } = await sb.from('classes').insert(payload);
  createMsg.textContent = error ? (error.message || 'Could not create class.') : 'Class created.';
  createMsg.className = 'form-msg ' + (error ? 'error' : 'success');
  if (!error) createForm.reset();
  if (!error) loadRows();
});

function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderRow(c) {
  const node = rowTemplate.content.cloneNode(true);
  const root = node.querySelector('.side-panel');
  root.dataset.id = c.id;

  const badge = node.querySelector('.row-badge');
  badge.textContent = c.status === 'live' ? '● Live now' : c.status === 'ended' ? 'Ended' : 'Scheduled';
  badge.className = 'badge row-badge ' + c.status;

  node.querySelector('.row-title').textContent = c.title;
  node.querySelector('.row-meta').textContent = `with ${c.instructor} · ${fmtTime(c.scheduled_at)} · ${c.duration_minutes} min`;

  const studioLink = node.querySelector('.row-studio');
  const endBtn = node.querySelector('.row-end');
  const deleteBtn = node.querySelector('.row-delete');

  studioLink.href = `smartboard.html?id=${c.id}`;
  studioLink.textContent = c.status === 'live' ? 'Open studio (live)' : 'Open studio';
  endBtn.disabled = c.status !== 'live';

  endBtn.addEventListener('click', async () => {
    if (!confirm('End this class? Do this only if the studio tab was closed unexpectedly.')) return;
    await sb.from('classes').update({ status: 'ended', stream_url: null }).eq('id', c.id);
    loadRows();
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    await sb.from('classes').delete().eq('id', c.id);
    loadRows();
  });

  return node;
}

async function loadRows() {
  const { data, error } = await sb.from('classes').select('*').order('scheduled_at', { ascending: false });
  if (error) { manageList.innerHTML = `<p>Couldn't load classes.</p>`; return; }
  manageList.innerHTML = '';
  data.forEach(c => manageList.appendChild(renderRow(c)));
}

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  await loadRows();

  sb
    .channel('instructor-classes-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, loadRows)
    .subscribe();
})();
