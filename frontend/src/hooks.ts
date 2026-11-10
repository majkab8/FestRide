import { useCallback, useEffect, useRef, useState } from "react";

/** Run an async loader when `deps` change; ignores results of stale runs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);

  const reload = useCallback(() => {
    const id = ++run.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => { if (id === run.current) setData(d); })
      .catch((e) => { if (id === run.current) setError(e); })
      .finally(() => { if (id === run.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
