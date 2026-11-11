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

/** Longest of `options` (longest first) that fits the input's width without being cut,
    re-checked when the input resizes. Returns a callback ref for the input and the placeholder. */
export function useFittingPlaceholder(options: string[]) {
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  const [text, setText] = useState(options[0]);
  const key = options.join("|");
  useEffect(() => {
    if (!el) return;
    const ctx = document.createElement("canvas").getContext("2d");
    const fit = () => {
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
      if (!ctx || room <= 0) return;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      setText(options.find((o) => ctx.measureText(o).width <= room) ?? options[options.length - 1]);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit); // web fonts change the text width once they load
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, key]);
  return [setEl, text] as const;
}
