import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://dbtclnbadnhysvtudcmb.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRidGNsbmJhZG5oeXN2dHVkY21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNTc5MjQsImV4cCI6MjEwNTgzMzkyNH0.jlm56i-Qc2X6i_tMVRnYBAI4E5ohty7fC5LBqYN9MxU';

/** Null until both browser keys are configured; callers must handle that. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
