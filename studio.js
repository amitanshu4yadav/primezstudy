const params = new URLSearchParams(window.location.search);
const classId = params.get('id');

const ink = document.getElementById('ink');
const inkCtx = ink.getContext('2d');
const screenVideo = document.getElementById('screen-video');
const camVideo = document.getElementById('cam-video');
const pip = document.getElementById('pip');
const pipHandle = document.getElementById('pip-handle');
const stagePlaceholder = document.getElementById('stage-placeholder');
const stageContainer = document.getElementById('stage-container');

const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const srcWhiteboardBtn = document.getElementById('src-whiteboard');
const srcScreenBtn = document.getElementById('src-screen');
const penTools = document.getElementById('pen-tools');
const penColor = document.getElementById('pen-color');
const penSize = document.getElementById('pen-size');
const fileInput = document.getElementById('file-input');
const btnGoLive = document.getElementById('btn-go-live');
const btnEnd = document.getElementById('btn-end');
const livePill = document.getElementById('studio-live-pill');
const studioTimer = document.getElementById('studio-timer');
const viewerCountEl = document.getElementById('viewer-count');
const classTitleEl = document.getElementById('studio-class-title');

// ---------- Local media ----------
let camStream = null;       // camera + mic
let camTrack = null, audioTrack = null;
let screenStream = null;    // when screen-sharing
let mainTrack = null;       // current "main" video track sent to viewers
let usingScreen = false;

async function enableCameraAndMic() {
  camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  camTrack = camStream.getVideoTracks()[0];
  audioTrack = camStream.getAudioTracks()[0];
  camVideo.srcObject = camStream;
  stagePlaceholder.style.display = 'none';
}

// ---------- Whiteboard ----------
let tool = 'pen';
let drawing = false;
let startX = 0, startY = 0;
let snapshotBeforeShape = null;
const history = [];
const redoStack = [];

function pushHistory() {
  const url = ink.toDataURL();
  history.push(url);
  if (history.length > 25) history.shift();
  redoStack.length = 0;
  slides[slideIndex] = url;
  renderThumbnails();
}

function restoreFromDataURL(url) {
  const img = new Image();
  img.onload = () => { inkCtx.clearRect(0, 0, ink.width, ink.height); inkCtx.drawImage(img, 0, 0); };
  img.src = url;
}

function canvasPoint(e) {
  const rect = ink.getBoundingClientRect();
  // #ink is CSS-scaled with object-fit:contain, so its bounding box and its
  // actual rendered (letterboxed) content area aren't the same once the
  // stage isn't a perfect 16:9 box (which it isn't now that it's full-screen).
  // Account for the letterbox offset, or clicks/touches map to the wrong spot.
  const canvasAspect = ink.width / ink.height;
  const boxAspect = rect.width / rect.height;
  let renderW, renderH, offsetX, offsetY;
  if (boxAspect > canvasAspect) {
    renderH = rect.height;
    renderW = renderH * canvasAspect;
    offsetX = (rect.width - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = rect.width;
    renderH = renderW / canvasAspect;
    offsetX = 0;
    offsetY = (rect.height - renderH) / 2;
  }
  const x = (e.clientX - rect.left - offsetX) * (ink.width / renderW);
  const y = (e.clientY - rect.top - offsetY) * (ink.height / renderH);
  return { x, y };
}

ink.addEventListener('pointerdown', (e) => {
  if (usingScreen) return; // drawing only on whiteboard mode for now
  if (tool === 'pan') return; // handled by the pan listener below
  e.preventDefault();
  drawing = true;
  const { x, y } = canvasPoint(e);
  startX = x; startY = y;
  inkCtx.lineJoin = 'round';
  inkCtx.lineCap = 'round';
  inkCtx.strokeStyle = penColor.value;
  inkCtx.lineWidth = Number(penSize.value);

  if (tool === 'pen' || tool === 'eraser') {
    inkCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    inkCtx.beginPath();
    inkCtx.moveTo(x, y);
  } else if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
    snapshotBeforeShape = ink.toDataURL();
  } else if (tool === 'text') {
    const text = prompt('Text:');
    if (text) {
      inkCtx.globalCompositeOperation = 'source-over';
      inkCtx.fillStyle = penColor.value;
      inkCtx.font = `${16 + Number(penSize.value) * 2}px Inter, sans-serif`;
      inkCtx.fillText(text, x, y);
      pushHistory();
    }
    drawing = false;
  }
});

ink.addEventListener('pointermove', (e) => {
  if (!drawing || usingScreen) return;
  e.preventDefault();
  const { x, y } = canvasPoint(e);

  if (tool === 'pen' || tool === 'eraser') {
    inkCtx.lineTo(x, y);
    inkCtx.stroke();
  } else if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
    const img = new Image();
    img.onload = () => {
      inkCtx.clearRect(0, 0, ink.width, ink.height);
      inkCtx.drawImage(img, 0, 0);
      inkCtx.globalCompositeOperation = 'source-over';
      inkCtx.strokeStyle = penColor.value;
      inkCtx.lineWidth = Number(penSize.value);
      inkCtx.beginPath();
      if (tool === 'rect') {
        inkCtx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'ellipse') {
        inkCtx.ellipse(startX + (x - startX) / 2, startY + (y - startY) / 2, Math.abs(x - startX) / 2, Math.abs(y - startY) / 2, 0, 0, Math.PI * 2);
        inkCtx.stroke();
      } else if (tool === 'line') {
        inkCtx.moveTo(startX, startY);
        inkCtx.lineTo(x, y);
        inkCtx.stroke();
      }
    };
    img.src = snapshotBeforeShape;
  }
});

['pointerup', 'pointerleave'].forEach(evt => ink.addEventListener(evt, () => {
  if (drawing) pushHistory();
  drawing = false;
}));

document.querySelectorAll('.tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tool = btn.dataset.tool;
  });
});

document.querySelectorAll('.swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    penColor.value = btn.dataset.color;
  });
});
penColor.addEventListener('input', () => {
  document.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
});

document.getElementById('btn-undo').addEventListener('click', () => {
  if (!history.length) return;
  redoStack.push(ink.toDataURL());
  const prev = history.pop();
  prev ? restoreFromDataURL(prev) : inkCtx.clearRect(0, 0, ink.width, ink.height);
});
document.getElementById('btn-redo').addEventListener('click', () => {
  if (!redoStack.length) return;
  history.push(ink.toDataURL());
  restoreFromDataURL(redoStack.pop());
});
document.getElementById('btn-clear').addEventListener('click', () => {
  pushHistory();
  inkCtx.clearRect(0, 0, ink.width, ink.height);
});

document.getElementById('btn-insert-image').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(ink.width * 0.6 / img.width, ink.height * 0.6 / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    inkCtx.drawImage(img, (ink.width - w) / 2, (ink.height - h) / 2, w, h);
    pushHistory();
  };
  img.src = URL.createObjectURL(file);
  fileInput.value = '';
});

const pdfInput = document.getElementById('pdf-input');
document.getElementById('btn-insert-pdf').addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files[0];
  pdfInput.value = '';
  if (!file) return;

  const btn = document.getElementById('btn-insert-pdf');
  const originalText = btn.textContent;
  btn.textContent = '…';
  btn.disabled = true;

  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    saveCurrentSlide();

    const newSlideUrls = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = viewport.width;
      tmpCanvas.height = viewport.height;
      await page.render({ canvasContext: tmpCanvas.getContext('2d'), viewport }).promise;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = ink.width; pageCanvas.height = ink.height;
      const pctx = pageCanvas.getContext('2d');
      pctx.fillStyle = '#fff';
      pctx.fillRect(0, 0, ink.width, ink.height);
      const scale = Math.min(ink.width * 0.92 / tmpCanvas.width, ink.height * 0.92 / tmpCanvas.height, 1);
      const w = tmpCanvas.width * scale, h = tmpCanvas.height * scale;
      pctx.drawImage(tmpCanvas, (ink.width - w) / 2, (ink.height - h) / 2, w, h);
      newSlideUrls.push(pageCanvas.toDataURL());
    }

    // Insert the new pages right after the current slide, as their own slides
    slides.splice(slideIndex + 1, 0, ...newSlideUrls);
    loadSlide(slideIndex + 1);
  } catch (err) {
    alert('Could not read that PDF: ' + (err.message || err));
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('btn-download-notes').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = ink.toDataURL('image/png');
  a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
});

// ---------- Slides (Google-Slides-style pages for the whiteboard) ----------
let slides = [null];          // each entry: dataURL of that slide's canvas, or null = blank
let slideIndex = 0;
const slideBar = document.getElementById('slide-bar');
const slideIndicator = document.getElementById('slide-indicator');
const thumbRail = document.getElementById('thumb-rail');

function renderThumbnails() {
  thumbRail.innerHTML = '';
  slides.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb' + (i === slideIndex ? ' active' : '');
    thumb.innerHTML = `
      <div class="thumb-num">${i + 1}</div>
      <img src="${url || blankThumbURL}">
      <button class="thumb-del" title="Delete slide">×</button>`;
    thumb.querySelector('img').addEventListener('click', () => {
      if (i === slideIndex) return;
      saveCurrentSlide();
      loadSlide(i);
    });
    thumb.querySelector('.thumb-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSlide(i);
    });
    thumbRail.appendChild(thumb);
  });
  const addTile = document.createElement('div');
  addTile.className = 'thumb thumb-add';
  addTile.innerHTML = '+';
  addTile.addEventListener('click', () => addSlide());
  thumbRail.appendChild(addTile);
}

const blankThumbCanvas = document.createElement('canvas');
blankThumbCanvas.width = 160; blankThumbCanvas.height = 90;
blankThumbCanvas.getContext('2d').fillStyle = '#fff';
blankThumbCanvas.getContext('2d').fillRect(0, 0, 160, 90);
const blankThumbURL = blankThumbCanvas.toDataURL();

function saveCurrentSlide() {
  slides[slideIndex] = ink.toDataURL();
}

function loadSlide(idx) {
  const url = slides[idx];
  if (url) {
    const img = new Image();
    img.onload = () => { inkCtx.clearRect(0, 0, ink.width, ink.height); inkCtx.drawImage(img, 0, 0); };
    img.src = url;
  } else {
    inkCtx.clearRect(0, 0, ink.width, ink.height);
  }
  slideIndex = idx;
  history.length = 0; redoStack.length = 0; // fresh undo stack per slide
  slideIndicator.textContent = `${slideIndex + 1} / ${slides.length}`;
  renderThumbnails();
}

function addSlide() {
  saveCurrentSlide();
  slides.splice(slideIndex + 1, 0, null);
  loadSlide(slideIndex + 1);
}

function deleteSlide(idx) {
  if (slides.length === 1) { inkCtx.clearRect(0, 0, ink.width, ink.height); slides[0] = null; renderThumbnails(); return; }
  if (!confirm('Delete this slide?')) return;
  slides.splice(idx, 1);
  const nextIdx = Math.min(idx, slides.length - 1);
  if (idx === slideIndex) loadSlide(nextIdx);
  else { if (idx < slideIndex) slideIndex--; slideIndicator.textContent = `${slideIndex + 1} / ${slides.length}`; renderThumbnails(); }
}

document.getElementById('slide-prev').addEventListener('click', () => {
  if (slideIndex === 0) return;
  saveCurrentSlide();
  loadSlide(slideIndex - 1);
});
document.getElementById('slide-next').addEventListener('click', () => {
  if (slideIndex === slides.length - 1) return;
  saveCurrentSlide();
  loadSlide(slideIndex + 1);
});
document.getElementById('slide-add').addEventListener('click', addSlide);
document.getElementById('slide-delete').addEventListener('click', () => deleteSlide(slideIndex));

renderThumbnails();


(function makePipDraggable() {
  let dragging = false, offX = 0, offY = 0;
  pip.addEventListener('pointerdown', (e) => {
    if (e.target === pipHandle) return;
    dragging = true;
    const r = pip.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const containerRect = stageContainer.getBoundingClientRect();
    let x = e.clientX - containerRect.left - offX;
    let y = e.clientY - containerRect.top - offY;
    x = Math.max(0, Math.min(x, containerRect.width - pip.offsetWidth));
    y = Math.max(0, Math.min(y, containerRect.height - pip.offsetHeight));
    pip.style.left = x + 'px'; pip.style.top = y + 'px'; pip.style.right = 'auto'; pip.style.bottom = 'auto';
  });
  window.addEventListener('pointerup', () => dragging = false);

  let resizing = false, startW = 0, startXr = 0;
  pipHandle.addEventListener('pointerdown', (e) => { resizing = true; startW = pip.offsetWidth; startXr = e.clientX; e.stopPropagation(); });
  window.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    const newW = Math.max(70, Math.min(220, startW + (e.clientX - startXr)));
    pip.style.width = newW + 'px';
    pip.style.height = newW + 'px';
  });
  window.addEventListener('pointerup', () => resizing = false);
})();

// ---------- Mic / camera toggle (instant, no renegotiation — just enable/disable the shared track) ----------
let micOn = true, camOn = true;
btnMic.addEventListener('click', () => {
  if (!audioTrack) return;
  micOn = !micOn;
  audioTrack.enabled = micOn;
  btnMic.classList.toggle('muted', !micOn);
  btnMic.textContent = micOn ? '🎤' : '🔇';
});
btnCam.addEventListener('click', () => {
  if (!camTrack) return;
  camOn = !camOn;
  camTrack.enabled = camOn;
  btnCam.classList.toggle('muted', !camOn);
  pip.classList.toggle('cam-off', !camOn);
});

// ---------- Whiteboard zoom (instructor-controlled, broadcasts to viewers) ----------
let zoom = 1, panX = 0, panY = 0;
const zoomLabel = document.getElementById('zoom-label');

function clampZoom(z) { return Math.max(1, Math.min(4, z)); }
function setZoom(z) {
  zoom = clampZoom(z);
  if (zoom === 1) { panX = 0; panY = 0; }
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
}
document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));

stageContainer.addEventListener('wheel', (e) => {
  if (usingScreen) return;
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15));
}, { passive: false });

// Pan tool: drag to move around when zoomed in
let panning = false, panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
ink.addEventListener('pointerdown', (e) => {
  if (tool !== 'pan' || usingScreen) return;
  panning = true;
  panStartX = e.clientX; panStartY = e.clientY;
  panOrigX = panX; panOrigY = panY;
});
window.addEventListener('pointermove', (e) => {
  if (!panning) return;
  panX = panOrigX + (e.clientX - panStartX) / zoom;
  panY = panOrigY + (e.clientY - panStartY) / zoom;
});
window.addEventListener('pointerup', () => panning = false);

// ---------- Broadcast compositor: what viewers actually receive as "main" video ----------
// Zoom/pan happen here (not on the ink canvas itself), so the instructor's
// own drawing surface stays at native resolution while viewers see the
// zoomed/panned framing in real time.
const broadcastCanvas = document.createElement('canvas');
broadcastCanvas.width = 1280; broadcastCanvas.height = 720;
const broadcastCtx = broadcastCanvas.getContext('2d');
let broadcastRAF = null;

function drawBroadcastFrame() {
  const W = broadcastCanvas.width, H = broadcastCanvas.height;
  if (!usingScreen) {
    broadcastCtx.fillStyle = '#fff';
    broadcastCtx.fillRect(0, 0, W, H);
    broadcastCtx.save();
    broadcastCtx.translate(W / 2, H / 2);
    broadcastCtx.scale(zoom, zoom);
    broadcastCtx.translate(-W / 2 + panX, -H / 2 + panY);
    broadcastCtx.drawImage(ink, 0, 0, W, H);
    broadcastCtx.restore();
  }
  broadcastRAF = requestAnimationFrame(drawBroadcastFrame);
}
drawBroadcastFrame();

// ---------- Source switching: whiteboard <-> screen share ----------
async function switchToScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch { return; }
  const track = screenStream.getVideoTracks()[0];
  track.addEventListener('ended', () => switchToWhiteboard()); // user clicked browser's "stop sharing"
  mainTrack = track;
  usingScreen = true;
  screenVideo.srcObject = screenStream;
  screenVideo.style.display = '';
  ink.style.display = 'none';
  slideBar.style.display = 'none';
  srcScreenBtn.classList.add('active');
  srcWhiteboardBtn.classList.remove('active');
  penTools.classList.add('disabled');
  applyMainTrackToPeers();
}

function switchToWhiteboard() {
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  mainTrack = whiteboardTrack;
  usingScreen = false;
  screenVideo.style.display = 'none';
  ink.style.display = '';
  slideBar.style.display = '';
  srcWhiteboardBtn.classList.add('active');
  srcScreenBtn.classList.remove('active');
  penTools.classList.remove('disabled');
  applyMainTrackToPeers();
}

srcScreenBtn.addEventListener('click', switchToScreen);
srcWhiteboardBtn.addEventListener('click', switchToWhiteboard);

function applyMainTrackToPeers() {
  for (const peer of peers.values()) {
    peer.mainT.sender.replaceTrack(mainTrack).catch(() => {});
  }
}

// ---------- Whiteboard canvas as a track (from the zoom/pan-aware compositor, not the raw ink canvas) ----------
let whiteboardTrack = broadcastCanvas.captureStream(20).getVideoTracks()[0];

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const recordCanvas = document.createElement('canvas');
recordCanvas.width = 1280;
recordCanvas.height = 720;
const recordCtx = recordCanvas.getContext('2d');
let recordRAF = null;

function drawRecordFrame() {
  const W = recordCanvas.width, H = recordCanvas.height;
  if (usingScreen && screenVideo.readyState >= 2) {
    recordCtx.fillStyle = '#000';
    recordCtx.fillRect(0, 0, W, H);
    recordCtx.drawImage(screenVideo, 0, 0, W, H);
  } else {
    recordCtx.drawImage(broadcastCanvas, 0, 0, W, H); // already zoomed/panned + white bg
  }

  if (camOn && camVideo.readyState >= 2) {
    const stageRect = stageContainer.getBoundingClientRect();
    const pipRect = pip.getBoundingClientRect();
    const scaleX = W / stageRect.width, scaleY = H / stageRect.height;
    const px = (pipRect.left - stageRect.left) * scaleX;
    const py = (pipRect.top - stageRect.top) * scaleY;
    const pw = pipRect.width * scaleX, ph = pipRect.height * scaleY;
    const cx = px + pw / 2, cy = py + ph / 2, radius = Math.min(pw, ph) / 2;

    recordCtx.save();
    recordCtx.beginPath();
    recordCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    recordCtx.clip();
    recordCtx.fillStyle = '#000';
    recordCtx.fillRect(px, py, pw, ph);
    recordCtx.drawImage(camVideo, px, py, pw, ph);
    recordCtx.restore();
    recordCtx.save();
    recordCtx.beginPath();
    recordCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    recordCtx.strokeStyle = 'rgba(255,255,255,.4)';
    recordCtx.lineWidth = 3;
    recordCtx.stroke();
    recordCtx.restore();
  }

  recordRAF = requestAnimationFrame(drawRecordFrame);
}

// ---------- Recording (optional, off by default — instructor toggles it) ----------
const btnRecord = document.getElementById('btn-record');
const uploadStatus = document.getElementById('upload-status');
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function startRecording() {
  if (!mainTrack || !audioTrack) { alert('Turn your camera on first.'); return; }
  drawRecordFrame(); // starts the compositing loop
  const composedVideoTrack = recordCanvas.captureStream(30).getVideoTracks()[0];
  const recordStream = new MediaStream([composedVideoTrack, audioTrack]);
  recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';
  mediaRecorder = new MediaRecorder(recordStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start(1000);
  isRecording = true;
  btnRecord.classList.add('muted');
  btnRecord.title = 'Stop recording';
}

function stopRecordingAndGetBlob() {
  return new Promise((resolve) => {
    if (recordRAF) { cancelAnimationFrame(recordRAF); recordRAF = null; }
    if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return; }
    mediaRecorder.onstop = () => resolve(new Blob(recordedChunks, { type: 'video/webm' }));
    mediaRecorder.stop();
  });
}

btnRecord.addEventListener('click', () => {
  if (isRecording) {
    stopRecordingAndGetBlob(); // stopped early by instructor choice, upload happens on End class too
    isRecording = false;
    btnRecord.classList.remove('muted');
    btnRecord.title = 'Record this class';
  } else {
    startRecording();
  }
});

async function uploadRecordingIfAny() {
  if (!isRecording && recordedChunks.length === 0) return;
  const blob = await stopRecordingAndGetBlob();
  if (!blob || blob.size === 0) return;

  uploadStatus.style.display = '';
  uploadStatus.textContent = 'Saving recording…';

  const path = `${classId}/${Date.now()}.webm`;
  const { error: uploadError } = await sb.storage.from('recordings').upload(path, blob, {
    contentType: 'video/webm',
    upsert: false
  });

  if (uploadError) {
    uploadStatus.textContent = 'Recording failed to save: ' + uploadError.message;
    return;
  }

  const { data } = sb.storage.from('recordings').getPublicUrl(path);
  await sb.from('classes').update({ recording_url: data.publicUrl }).eq('id', classId);
  uploadStatus.textContent = 'Recording saved.';
}


const peers = new Map(); // viewerId -> { pc, mainT, camT, audT }
let channel = null;
let liveStartedAt = null;
let timerInterval = null;

function connectViewer(viewerId) {
  if (peers.has(viewerId)) return;
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const mainT = pc.addTransceiver(mainTrack, { direction: 'sendonly' });
  const camT = pc.addTransceiver(camTrack, { direction: 'sendonly' });
  const audT = pc.addTransceiver(audioTrack, { direction: 'sendonly' });
  peers.set(viewerId, { pc, mainT, camT, audT });

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(channel, 'ice-candidate', { viewerId, candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
      peers.delete(viewerId);
      updateViewerCount();
    }
  };

  pc.createOffer().then(async (offer) => {
    await pc.setLocalDescription(offer);
    sendSignal(channel, 'offer', { viewerId, sdp: offer });
  });
  updateViewerCount();
}

function updateViewerCount() { viewerCountEl.textContent = peers.size; }

async function goLive() {
  if (!camStream) { alert('Turn your camera on first.'); return; }

  if (!mainTrack) mainTrack = whiteboardTrack;

  channel = signalChannel(classId);
  onSignal(channel, 'viewer-hello', ({ viewerId }) => connectViewer(viewerId));
  onSignal(channel, 'answer', ({ viewerId, sdp }) => {
    const peer = peers.get(viewerId);
    if (peer) peer.pc.setRemoteDescription(sdp);
  });
  onSignal(channel, 'ice-candidate', ({ viewerId, candidate }) => {
    const peer = peers.get(viewerId);
    if (peer && candidate) peer.pc.addIceCandidate(candidate).catch(() => {});
  });

  await new Promise((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
  sendSignal(channel, 'instructor-ready', {});

  await sb.from('classes').update({ status: 'live' }).eq('id', classId);

  btnGoLive.style.display = 'none';
  btnEnd.style.display = '';
  livePill.style.display = '';
  liveStartedAt = Date.now();
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - liveStartedAt) / 1000);
    studioTimer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

async function endClass() {
  for (const { pc } of peers.values()) pc.close();
  peers.clear();
  if (channel) { sendSignal(channel, 'instructor-bye', {}); channel.unsubscribe(); }
  await uploadRecordingIfAny();
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInterval);
  await sb.from('classes').update({ status: 'ended', stream_url: null }).eq('id', classId);
  window.location.href = 'instructor.html';
}

btnGoLive.addEventListener('click', goLive);
btnEnd.addEventListener('click', () => { if (confirm('End this class for everyone?')) endClass(); });

window.addEventListener('beforeunload', () => {
  for (const { pc } of peers.values()) pc.close();
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
});

// ---------- Boot ----------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  if (!classId) { classTitleEl.textContent = 'No class specified'; return; }

  const { data: cls } = await sb.from('classes').select('*').eq('id', classId).single();
  if (cls) classTitleEl.textContent = cls.title;

  const senderName = cls?.instructor || session.user.user_metadata?.full_name || session.user.email;
  initSidePanel({ classId, isInstructor: true, senderName });

  try {
    await enableCameraAndMic();
  } catch {
    stagePlaceholder.textContent = 'Camera/mic permission needed — allow access and reload.';
  }
})();
