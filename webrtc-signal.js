// Shared WebRTC + Supabase Realtime signaling helper.
// Signaling travels over a Supabase Realtime BROADCAST channel — nothing is
// written to the database, so there's no table and no RLS to manage for it.
// One channel per class: "class-signal-<classId>".

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    // Free STUN only. If viewers on strict/symmetric NATs can't connect,
    // add a TURN server here, e.g. Open Relay (free tier):
    // { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    // { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Math.random().toString(36).slice(2) + Date.now();
}

function signalChannel(classId) {
  return sb.channel('class-signal-' + classId, {
    config: { broadcast: { self: false, ack: false } }
  });
}

function sendSignal(channel, event, payload) {
  channel.send({ type: 'broadcast', event, payload });
}

function onSignal(channel, event, handler) {
  channel.on('broadcast', { event }, (msg) => handler(msg.payload));
}
