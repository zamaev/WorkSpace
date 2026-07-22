import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { uiZoom } from "../lib/zoom";

// Попап, привязанный к якорю: position:fixed + портал в body. Портал
// обязателен: transform у модала (.sheet) делает его containing block'ом
// для fixed-элементов, и без портала попап позиционировался бы от модала
// и резался его overflow.
export function AnchoredPopover({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const pop = ref.current;
    if (!anchor || !pop) return;
    // все rect'ы — в viewport-пикселях; style.top/left браузер умножит
    // на zoom ещё раз, поэтому финальные координаты делим на него
    const z = uiZoom();
    const a = anchor.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    let left = a.left;
    let top = a.bottom + 6;
    if (left + p.width > window.innerWidth - 12) left = window.innerWidth - p.width - 12;
    if (left < 12) left = 12;
    // не влезает вниз — открываем вверх
    if (top + p.height > window.innerHeight - 12) top = Math.max(12, a.top - p.height - 6);
    setPos({ top: top / z, left: left / z });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !(anchorRef.current && anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={ref}
      className="popover !w-max"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, right: "auto", zIndex: 70 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
