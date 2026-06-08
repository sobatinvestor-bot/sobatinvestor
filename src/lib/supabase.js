// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// URL project kamu (sudah diisi):
const SUPABASE_URL = 'https://hmkeqvxcifggxownzrhx.supabase.co';

// ⬇️ TEMPEL anon public key kamu di sini (Settings → API Keys → anon public, klik Copy).
// Aman untuk frontend: kunci ini memang dirancang publik, dilindungi RLS.
// JANGAN pakai service_role key di sini.
const SUPABASE_ANON_KEY = 'PASTE_ANON_KEY_DISINI';

export const supabase = createClient(SUPABASE_URL, eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2VxdnhjaWZnZ3hvd256cmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjYyOTUsImV4cCI6MjA5NjQ0MjI5NX0.x6M4BxlbWnxD32iLG75Tm6I-u-46PzjSVI61rCXP4dg);
