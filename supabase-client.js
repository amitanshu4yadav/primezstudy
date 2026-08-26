// Fill these in from Supabase → Project Settings → API
const SUPABASE_URL = 'https://xiamjwpltbqzoeyjnjpx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6mhgDDkMd12O2vDXnn50QA_Ai_FpgW0';

// Renamed to `sb` to avoid clashing with the global `supabase` object
// that the supabase-js CDN script itself creates on `window`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
