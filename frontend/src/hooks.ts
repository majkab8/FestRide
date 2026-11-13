import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  const reload = useCallback(() => {
    const id = ++latestRequest.current;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (id === latestRequest.current) setData(result);
      })
      .catch((e) => {
        if (id === latestRequest.current) setError(e);
      })
      .finally(() => {
        if (id === latestRequest.current) setLoading(false);
      });
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function useFittingPlaceholder(options: string[]) {
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  const [text, setText] = useState(options[0]);
  const key = options.join("|");
  useEffect(() => {
    if (!el) return;
    const ctx = document.createElement("canvas").getContext("2d");
    const fitPlaceholder = () => {
      const style = getComputedStyle(el);
      const room =
        el.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        4;
      if (!ctx || room <= 0) return;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      setText(
        options.find((option) => ctx.measureText(option).width <= room) ??
          options[options.length - 1],
      );
    };
    fitPlaceholder();
    const resizeObserver = new ResizeObserver(fitPlaceholder);
    resizeObserver.observe(el);
    document.fonts?.ready.then(fitPlaceholder);
    return () => resizeObserver.disconnect();
  }, [el, key]);
  return [setEl, text] as const;
}
