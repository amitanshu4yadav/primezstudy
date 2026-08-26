const params = new URLSearchParams(window.location.search);
const classId = params.get('id');

const videoWrap = document.getElementById('video-wrap');
const classBadge = document.getElementById('class-badge');
const classTitle = document.getElementById('class-title');
const classCrumb = document.getElementById('class-title-crumb');
const classInstructor = document.getElementById('class-instructor');
const classDesc = document.getElementById('class-desc');
const classTime = document.getElementById('class-time');
const classDuration = document.getElementById('class-duration');

let pc = null;
let channel = null;
const viewerId = uid();
let mainStreamObj = null;
let camStreamObj = null;

function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderPlaceholder(text) {
  videoWrap.innerHTML = `<div class="video-placeholder"><span class="dot"></span>${text}</div>`;
}

function buildPlayerDOM() {
  videoWrap.innerHTML = `
    <video id="main-video" autoplay playsinline controls></video>
    <div id="viewer-pip" class="pip">
      <video id="pip-video" autoplay playsinline muted></video>
      <div class="pip-handle" id="viewer-pip-handle"></div>
    </div>`;
  makePipDraggable();
}

function makePipDraggable() {
  const pip = document.getElementById('viewer-pip');
  const handle = document.getElementById('viewer-pip-handle');
  let dragging = false, offX = 0, offY = 0;

  pip.addEventListener('pointerdown', (e) => {
    if (e.target === handle) return;
    dragging = true;
    const r = pip.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const cRect = videoWrap.getBoundingClientRect();
    let x = e.clientX - cRect.left - offX;
    let y = e.clientY - cRect.top - offY;
    x = Math.max(0, Math.min(x, cRect.width - pip.offsetWidth));
    y = Math.max(0, Math.min(y, cRect.height - pip.offsetHeight));
    pip.style.left = x + 'px'; pip.style.top = y + 'px'; pip.style.right = 'auto'; pip.style.bottom = 'auto';
  });
  window.addEventListener('pointerup', () => dragging = false);

  let resizing = false, startW = 0, startX = 0;
  handle.addEventListener('pointerdown', (e) => { resizing = true; startW = pip.offsetWidth; startX = e.clientX; e.stopPropagation(); });
  window.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    const newW = Math.max(70, Math.min(200, startW + (e.clientX - startX)));
    pip.style.width = newW + 'px';
    pip.style.height = newW + 'px';
  });
  window.addEventListener('pointerup', () => resizing = false);
}

function connectToInstructor() {
  if (channel) return;
  channel = signalChannel(classId);

  onSignal(channel, 'offer', async ({ viewerId: to, sdp }) => {
    if (to !== viewerId) return;
    pc = new RTCPeerConnection(ICE_SERVERS);
    mainStreamObj = new MediaStream();
    camStreamObj = new MediaStream();
    buildPlayerDOM();
    document.getElementById('main-video').srcObject = mainStreamObj;
    document.getElementById('pip-video').srcObject = camStreamObj;

    pc.ontrack = (e) => {
      const idx = pc.getTransceivers().indexOf(e.transceiver);
      // Fixed order set by the instructor's studio: 0 = main, 1 = camera, 2 = mic
      if (idx === 0) mainStreamObj.addTrack(e.track);
      else camStreamObj.addTrack(e.track);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(channel, 'ice-candidate', { viewerId, candidate: e.candidate });
    };

    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal(channel, 'answer', { viewerId, sdp: answer });
  });

  onSignal(channel, 'ice-candidate', ({ viewerId: to, candidate }) => {
    if (to !== viewerId) return;
    if (pc && candidate) pc.addIceCandidate(candidate).catch(() => {});
  });

  onSignal(channel, 'instructor-ready', () => sendSignal(channel, 'viewer-hello', { viewerId }));

  onSignal(channel, 'instructor-bye', () => {
    renderPlaceholder('Class ended.');
    if (pc) { pc.close(); pc = null; }
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') sendSignal(channel, 'viewer-hello', { viewerId });
  });
}

function renderClass(c) {
  classTitle.textContent = c.title;
  classCrumb.textContent = c.title;
  classInstructor.textContent = c.instructor;
  classDesc.textContent = c.description || '';
  classTime.textContent = fmtTime(c.scheduled_at);
  classDuration.textContent = c.duration_minutes + ' min';

  classBadge.textContent = c.status === 'live' ? '● Live now' : c.status === 'ended' ? 'Ended' : 'Scheduled';
  classBadge.className = 'badge ' + c.status;

  const downloadLink = document.getElementById('download-recording');
  if (c.status === 'ended' && c.recording_url) {
    downloadLink.href = c.recording_url;
    downloadLink.style.display = '';
  } else {
    downloadLink.style.display = 'none';
  }

  if (c.status === 'live') {
    renderPlaceholder('Connecting to the live stream…');
    connectToInstructor();
  } else if (c.status === 'ended') {
    if (c.recording_url) {
      videoWrap.innerHTML = `<video src="${c.recording_url}" controls playsinline style="width:100%; height:100%; object-fit:contain; background:#000;"></video>`;
    } else {
      renderPlaceholder('Recording is not available — this was a live-only session.');
    }
  } else {
    renderPlaceholder('This class hasn\'t started yet.');
  }
}

async function loadClass() {
  const { data, error } = await sb.from('classes').select('*').eq('id', classId).single();
  if (error || !data) { renderPlaceholder('Class not found.'); return; }
  renderClass(data);
}

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  if (!classId) { renderPlaceholder('No class specified.'); return; }

  await loadClass();

  const senderName = session.user.user_metadata?.full_name || session.user.email;
  initSidePanel({ classId, isInstructor: false, senderName });

  sb
    .channel('class-' + classId + '-db')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${classId}` },
      (payload) => renderClass(payload.new))
    .subscribe();
})();

window.addEventListener('beforeunload', () => {
  if (pc) pc.close();
  if (channel) channel.unsubscribe();
});
