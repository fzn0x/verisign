import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { renderPage } from "../../lib/pdf";
import { PT_PER_MM, layoutStamp } from "../../lib/stamp";
import type { Issuer } from "../../lib/types";
import { PREVIEW_ID, useSigning } from "../../stores/signing";
import { StampPreview } from "./StampPreview";
import styles from "./Sign.module.css";

/** Fits the page into the stage, reporting the CSS width to render at. */
function useFit(pageAspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const styles = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      const h = el.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
      const fit = h > 0 ? Math.min(w, h * pageAspect) : w;
      setWidth(Math.max(160, Math.floor(fit)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageAspect]);
  return { ref, width };
}

export function SignStage({ issuer }: { issuer: Issuer }) {
  const pdf = useSigning((s) => s.pdf);
  const pages = useSigning((s) => s.pages);
  const page = useSigning((s) => s.page);
  const setPage = useSigning((s) => s.setPage);
  const x = useSigning((s) => s.x);
  const y = useSigning((s) => s.y);
  const sizeMm = useSigning((s) => s.sizeMm);
  const caption = useSigning((s) => s.caption);
  const moveTo = useSigning((s) => s.moveTo);
  const phase = useSigning((s) => s.phase);
  const result = useSigning((s) => s.result);

  const box = pages[page - 1] ?? { width: 595, height: 842 };
  const { ref, width } = useFit(box.width / box.height);
  const height = (width / box.width) * box.height;
  const scale = width / box.width; // CSS px per point

  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    if (!pdf || !canvas.current || width === 0) return;
    let cancelled = false;
    let task: ReturnType<typeof renderPage> | null = null;
    setRendering(true);
    pdf.getPage(page).then((p) => {
      if (cancelled || !canvas.current) return;
      task = renderPage(p, canvas.current, width);
      task.promise.then(
        () => !cancelled && setRendering(false),
        () => undefined,
      );
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, width]);

  const layout = useMemo(() => {
    const doc = result?.doc;
    return layoutStamp(
      {
        verifyUrl: doc?.verifyUrl ?? `${window.location.origin}/v/${PREVIEW_ID}`,
        id: doc?.id ?? PREVIEW_ID,
        issuer: doc?.issuer ?? issuer,
        caption,
      },
      sizeMm,
    );
  }, [issuer, caption, sizeMm, result]);

  const drag = useRef<{ px: number; py: number; x0: number; y0: number } | null>(null);
  const locked = phase !== "ready";

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (locked || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x0: x, y0: y };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    moveTo(d.x0 + (e.clientX - d.px) / width, d.y0 + (e.clientY - d.py) / height, issuer);
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = (e.shiftKey ? 5 : 1) * PT_PER_MM;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    moveTo(x + dx / box.width, y + dy / box.height, issuer);
  }

  const leftMm = Math.round((x * box.width) / PT_PER_MM);
  const topMm = Math.round((y * box.height) / PT_PER_MM);
  const scaleBarMm = 20;

  return (
    <section className={styles.stage} aria-label="Page preview">
      <div className={styles.stageBar}>
        <div className={styles.pager}>
          <button type="button" className={styles.pagerButton} onClick={() => setPage(page - 1)} disabled={page <= 1 || locked} aria-label="Previous page">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className={styles.pagerText}>
            Page {page} of {pages.length}
          </span>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage(page + 1)}
            disabled={page >= pages.length || locked}
            aria-label="Next page"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <span className={styles.paperSize}>
          {Math.round(box.width / PT_PER_MM)} × {Math.round(box.height / PT_PER_MM)} mm
        </span>
      </div>

      <div className={styles.viewport} ref={ref}>
        <div className={styles.sheet} style={{ width, height }} data-rendering={rendering || undefined}>
          <canvas ref={canvas} className={styles.canvas} style={{ width, height }} />
          <div
            className={styles.stamp}
            data-locked={locked || undefined}
            data-issued={phase === "done" || undefined}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: layout.width * scale,
              height: layout.height * scale,
            }}
            role="group"
            aria-roledescription="movable stamp"
            aria-label={`QR stamp, ${leftMm} mm from the left and ${topMm} mm from the top. Use the arrow keys to move it by 1 mm, with Shift for 5 mm.`}
            tabIndex={locked ? -1 : 0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <StampPreview layout={layout} />
            <span className={styles.stampTag} aria-hidden>
              {leftMm} mm, {topMm} mm
            </span>
          </div>
        </div>
      </div>

      <div className={styles.scale} aria-hidden>
        <span className={styles.scaleBar} style={{ width: scaleBarMm * PT_PER_MM * scale }} />
        <span>{scaleBarMm} mm</span>
      </div>
    </section>
  );
}
