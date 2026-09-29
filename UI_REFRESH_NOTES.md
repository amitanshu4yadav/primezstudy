# PrimezStudy UI refresh

The site now uses a professional light product system built around warm white surfaces, ink typography, cobalt actions, and a lime live-status signal. The sign-in screen has a branded live-learning hero, orbit animation, clearer hierarchy, and a more focused authentication card.

The student experience now includes a responsive navigation rail, learning snapshot cards, live-class emphasis, upcoming schedule hierarchy, and improved hover and loading states. The existing Supabase authentication, class loading, realtime class subscription, WebRTC player, lecture library, and instructor studio hooks remain intact.

The admin experience now includes a persistent operations sidebar, workspace metrics, a polished lecture publishing flow, library health guidance, search-ready management views, and a Members tab. The Members tab reads from the existing `profiles` table and supports client-side search; it intentionally exposes profile IDs rather than auth emails because the supplied schema does not expose email addresses through the `profiles` table.

All static HTML pages inherit the same visual system, including player, lectures, leaderboard, instructor, smartboard, and watch views. Motion respects `prefers-reduced-motion`.

## Live audio and Drive lecture sources

The live WebRTC viewer now keeps incoming microphone tracks in the main media stream, disables the forced mute state, and exposes a custom sound toggle. The instructor offer already publishes the microphone track captured by `getUserMedia({ video: true, audio: true })`.

The admin lecture publisher now accepts either a local video file or a Google Drive file link. Drive links are normalized to the Drive preview URL and rendered inside the wrapped player using an iframe. Local uploads continue using Supabase Storage and recorded lecture playback continues using the custom player controls.
