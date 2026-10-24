import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Re-runs `onChange` whenever Postgres emits a change for the given table.
 * Without Supabase browser keys configured this is a no-op, so the app still
 * works against the PHP API alone.
 */
export function useRealtime(table, onChange) {
  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel(`${table}-changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange(payload))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, onChange]);
}
