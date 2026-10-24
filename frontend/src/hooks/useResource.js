import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api/client.js';

/**
 * Loads a resource from the PHP API and exposes reload().
 * `path` may include a query string; `params` is appended if given.
 * Unwraps a `{ data: [...] }` envelope automatically.
 */
export function useResource(path, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const full = params ? `${path}${qs(params)}` : path;

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(full)
      .then((payload) => setData(Array.isArray(payload) ? payload : payload?.data ?? payload))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [full]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
