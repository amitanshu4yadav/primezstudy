# PrimezStudy — live classes platform (WebRTC + Supabase)

Plain HTML/CSS/JS, no build step. Auth + data + realtime signaling via
Supabase. Video is **peer-to-peer WebRTC straight from the instructor's
browser** — no RTMP, no HLS, no OBS, no separate streaming server, no
third-party video platform.

## Files
```
index.html                  Login / signup (email+password and Google)
dashboard.html               Live / upcoming / ended class list (students)
instructor.html               Create classes, go live / end class (you)
class.html                     Live player for one class
css/style.css                  All styling
js/supabase-client.js          Supabase init — your project URL + key
js/webrtc-signal.js            Shared WebRTC + Realtime Broadcast helpers
js/auth.js                       Login/signup logic
js/dashboard.js                  Class list + realtime status
js/instructor.js                 Create/manage classes + broadcast (go live)
js/player.js                      Viewer-side WebRTC connection + realtime status
schema.sql                        Table, RLS policies, realtime, seed row
```

## 1. Supabase setup
1. Project Settings → API → copy **Project URL** and **anon/publishable
   key** into `js/supabase-client.js`.
2. SQL Editor → run `schema.sql`. Creates the `classes` table, RLS
   policies, enables realtime (Postgres Changes), and adds one placeholder
   class. WebRTC signaling itself needs no table — it rides Supabase
   Realtime **Broadcast** channels created on the fly by the client.
3. (Optional) Authentication → Providers → Google → enable, with a Google
   Cloud OAuth client (redirect URI is shown on that Supabase page).
   Authentication → URL Configuration → set Site URL + Redirect URLs to
   your deployed domain.

## 2. How going live works now
No external server, no Docker, no Cloudflare Tunnel:
1. Open `instructor.html`, create a class.
2. Hit **Go live**, choose "Share screen" or "Use camera", grant the
   browser permission.
3. Your browser now holds the class open — `status` flips to `live` in
   the database, and any student who opens `class.html` for that class
   gets a direct WebRTC connection straight to your browser.
4. **Keep the instructor tab open for the whole session** — the stream
   only exists in that tab's memory. Hit **End class** (or just close the
   tab, since the underlying track ending also triggers it) to end it.

This is peer-to-peer (mesh): your browser opens one connection per
viewer. It works well for small classes (roughly a couple dozen viewers,
depending on your upload bandwidth) but won't scale to a large audience —
that would need a proper SFU media server, which is a bigger addition.

## 3. Run the site
Any static file server works:
```
npx serve .
```
Open `index.html`. Sign up / log in, then:
- `instructor.html` — create a class, then **Go live**
- `dashboard.html` — what students see: live classes at the top, realtime
- `class.html` — the actual player; connects automatically once the
  class is live

## Notes
- **STUN only, free.** Connection setup uses Google's public STUN
  servers. If some students (often on stricter mobile-carrier NATs) can't
  connect, add a TURN server — `js/webrtc-signal.js` has a commented-out
  free Open Relay entry to uncomment.
- **HTTPS required.** `getUserMedia`/`getDisplayMedia` only work over
  HTTPS (or `localhost`), so deploy behind HTTPS — any static host with a
  free TLS cert (Netlify, Vercel, GitHub Pages, Cloudflare Pages) works
  fine here since there's no backend beyond Supabase.
- **Realtime Broadcast is open by default** to anyone with your anon key
  who knows the channel name (`class-signal-<classId>`) — fine for a
  small/simple setup since it only carries connection-setup data behind
  an already auth-gated page. Lock it down further later via Supabase's
  "Private channels" + RLS on `realtime.messages` if needed.
- **How "live only" is enforced**: there's no upload or recording path
  anywhere in the app. Ending a class stops the local media tracks and
  sets status to `ended`; the player explicitly shows "Recording is not
  available" rather than trying to replay anything.
- RLS lets any signed-in user manage classes for now (simple single/small
  team instructor setup) — see the comment in `schema.sql` for how to
  lock that down to specific instructor accounts later.


## Batches and payments

- `dashboard.html` shows published free and paid batches.
- `instructor.html` includes batch creation for drafts, free cohorts, and paid cohorts.
- `admin.html` includes a Batches tab for managing all batch records.
- Run `primezstudy-batches-payments.sql` once in Supabase before using these screens.
- Razorpay Checkout is wired to test mode. The browser stores only the test publishable key; never place the Razorpay secret in client code. See `RAZORPAY_SETUP.md` for server-side verification requirements.
