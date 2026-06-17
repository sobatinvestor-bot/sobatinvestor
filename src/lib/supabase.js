// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// URL project kamu:
const SUPABASE_URL = 'https://hmkeqvxcifggxownzrhx.supabase.co';

// anon public key (aman untuk frontend, dilindungi RLS):
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2VxdnhjaWZnZ3hvd256cmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjYyOTUsImV4cCI6MjA5NjQ0MjI5NX0.x6M4BxlbWnxD32iLG75Tm6I-u-46PzjSVI61rCXP4dg';

// Sesi disimpan di sessionStorage (per-tab), bukan localStorage:
// tutup tab/browser -> sesi hilang -> buka lagi = harus login (auto-login mati).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
