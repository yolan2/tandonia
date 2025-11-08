// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

// Frontend-safe keys should be prefixed with VITE_ for Vite projects.
// Use import.meta.env when available (Vite), otherwise fall back to process.env.
// @ts-ignore - import.meta may not be typed in this environment
const supabaseUrl = (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || process.env.SUPABASE_URL || '';
// @ts-ignore
const supabaseAnonKey = (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
