// Shared live chat + poll panel. Call initSidePanel({ classId, isInstructor, senderName })
// once the DOM (chat-list, chat-form, chat-input, poll-panel, tab buttons) is in place.

async function initSidePanel({ classId, isInstructor, senderName }) {
  const chatList = document.getElementById('chat-list');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const tabChat = document.getElementById('tab-chat');
  const tabPoll = document.getElementById('tab-poll');
  const chatPanel = document.getElementById('chat-panel');
  const pollPanel = document.getElementById('poll-panel');
  const pollCreateBox = document.getElementById('poll-create');
  const pollLiveBox = document.getElementById('poll-live');

  const tabNotes = document.getElementById('tab-notes');
  const notesPanel = document.getElementById('notes-panel');
  const notesArea = document.getElementById('notes-area');

  const { data: { session } } = await sb.auth.getSession();
  const myId = session.user.id;

  // ---- Tabs ----
  function activateTab(name) {
    tabChat.classList.toggle('active', name === 'chat');
    tabPoll.classList.toggle('active', name === 'poll');
    tabNotes.classList.toggle('active', name === 'notes');
    chatPanel.style.display = name === 'chat' ? '' : 'none';
    pollPanel.style.display = name === 'poll' ? '' : 'none';
    notesPanel.style.display = name === 'notes' ? '' : 'none';
  }
  tabChat.addEventListener('click', () => activateTab('chat'));
  tabPoll.addEventListener('click', () => activateTab('poll'));
  tabNotes.addEventListener('click', () => activateTab('notes'));

  // ---- Notes ----
  if (isInstructor) {
    notesArea.readOnly = false;
    const notesStatus = document.getElementById('notes-status');
    let notesTimer = null;
    let savingOwnEdit = false;
    notesArea.addEventListener('input', () => {
      notesStatus.textContent = 'Saving…';
      clearTimeout(notesTimer);
      notesTimer = setTimeout(async () => {
        savingOwnEdit = true;
        await sb.from('classes').update({ notes: notesArea.value }).eq('id', classId);
        notesStatus.textContent = 'Saved';
        setTimeout(() => { savingOwnEdit = false; }, 500);
      }, 700);
    });
    sb.channel('notes-' + classId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${classId}` }, (payload) => {
        if (!savingOwnEdit && document.activeElement !== notesArea) notesArea.value = payload.new.notes || '';
      })
      .subscribe();
  } else {
    sb.channel('notes-' + classId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${classId}` }, (payload) => {
        notesArea.value = payload.new.notes || '';
      })
      .subscribe();
  }
  const { data: initialClass } = await sb.from('classes').select('notes').eq('id', classId).single();
  notesArea.value = initialClass?.notes || '';

  // ---- Chat ----
  const avatarColors = ['#ffb35a', '#ff8a5a', '#ffd35a', '#a6712f', '#ffc98a'];
  function colorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function appendMessage(m) {
    const isOwn = m.sender_name === senderName;
    const div = document.createElement('div');
    div.className = 'chat-msg' + (isOwn ? ' own' : '');
    div.innerHTML = `
      <div class="chat-avatar" style="background:${colorForName(m.sender_name)}">${escapeHtml(m.sender_name).slice(0, 1).toUpperCase()}</div>
      <div class="chat-bubble-wrap">
        <span class="chat-sender">${isOwn ? 'You' : escapeHtml(m.sender_name)}</span>
        <span class="chat-body">${escapeHtml(m.body)}</span>
      </div>`;
    chatList.appendChild(div);
    chatList.scrollTop = chatList.scrollHeight;
  }

  const { data: history } = await sb.from('messages').select('*').eq('class_id', classId).order('created_at', { ascending: true }).limit(100);
  (history || []).forEach(appendMessage);

  sb.channel('messages-' + classId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `class_id=eq.${classId}` },
      (payload) => appendMessage(payload.new))
    .subscribe();

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = chatInput.value.trim();
    if (!body) return;
    chatInput.value = '';
    await sb.from('messages').insert({ class_id: classId, sender_name: senderName, body });
  });

  // ---- Polls ----
  if (isInstructor) {
    pollCreateBox.style.display = '';
    const qInput = document.getElementById('poll-question');
    const optInputs = () => Array.from(document.querySelectorAll('.poll-option-input'));
    document.getElementById('poll-launch').addEventListener('click', async () => {
      const question = qInput.value.trim();
      const options = optInputs().map(i => i.value.trim()).filter(Boolean);
      if (!question || options.length < 2) { alert('Add a question and at least 2 options.'); return; }
      await sb.from('polls').update({ is_open: false }).eq('class_id', classId).eq('is_open', true); // close any prior poll
      await sb.from('polls').insert({ class_id: classId, question, options, is_open: true });
      qInput.value = '';
      optInputs().forEach(i => i.value = '');
    });
    document.getElementById('poll-add-option').addEventListener('click', () => {
      const wrap = document.getElementById('poll-options-wrap');
      const input = document.createElement('input');
      input.className = 'poll-option-input';
      input.placeholder = `Option ${wrap.children.length + 1}`;
      wrap.appendChild(input);
    });
  }

  let currentPoll = null;
  let myVoteOptionIndex = null;

  function renderPollResults(poll, votes) {
    const counts = poll.options.map((_, i) => votes.filter(v => v.option_index === i).length);
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    myVoteOptionIndex = votes.find(v => v.voter_id === myId)?.option_index ?? null;

    pollLiveBox.innerHTML = `
      <div class="poll-question">${escapeHtml(poll.question)}</div>
      ${poll.options.map((opt, i) => {
        const pct = Math.round((counts[i] / total) * 100);
        const canVote = !isInstructor && poll.is_open && myVoteOptionIndex === null;
        return `
          <div class="poll-option ${myVoteOptionIndex === i ? 'voted' : ''}" data-idx="${i}" style="${canVote ? 'cursor:pointer;' : ''}">
            <div class="poll-bar" style="width:${pct}%"></div>
            <div class="poll-option-label"><span>${escapeHtml(opt)}</span><span>${pct}% · ${counts[i]}</span></div>
          </div>`;
      }).join('')}
      <div class="poll-total">${total === 1 && counts.every(c => c === 0) ? 'No votes yet' : `${votes.length} vote${votes.length === 1 ? '' : 's'}`} ${poll.is_open ? '' : '· Closed'}</div>
      ${isInstructor && poll.is_open ? `<button class="btn-ghost" id="poll-close-btn" style="margin-top:8px; width:100%;">Close poll</button>` : ''}
    `;

    if (!isInstructor && poll.is_open && myVoteOptionIndex === null) {
      pollLiveBox.querySelectorAll('.poll-option').forEach(el => {
        el.addEventListener('click', async () => {
          const idx = Number(el.dataset.idx);
          await sb.from('poll_votes').insert({ poll_id: poll.id, voter_id: myId, option_index: idx });
        });
      });
    }
    const closeBtn = document.getElementById('poll-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', async () => {
      await sb.from('polls').update({ is_open: false }).eq('id', poll.id);
    });
  }

  async function loadActivePoll() {
    const { data: poll } = await sb.from('polls').select('*').eq('class_id', classId).order('created_at', { ascending: false }).limit(1).single();
    if (!poll) { pollLiveBox.innerHTML = '<p class="poll-empty">No poll yet.</p>'; return; }
    currentPoll = poll;
    const { data: votes } = await sb.from('poll_votes').select('*').eq('poll_id', poll.id);
    renderPollResults(poll, votes || []);
  }

  await loadActivePoll();

  sb.channel('polls-' + classId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter: `class_id=eq.${classId}` }, loadActivePoll)
    .subscribe();
  sb.channel('poll-votes-' + classId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => {
      if (currentPoll) loadActivePoll();
    })
    .subscribe();
}
