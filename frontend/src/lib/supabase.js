import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null until both browser keys are configured; callers must handle that. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
