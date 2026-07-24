import { useState } from "react";
import { uiZoom } from "../lib/zoom";

// Ручка изменения ширины колонки: pointer-drag, ширина отдаётся через
// колбэк. Сохранение делает сам onDelta — pointerup замыкал бы значение
// старого рендера. Используется инспектором задач и панелью заметок.
export function ColResize({ onDelta }: { onDelta: (dx: number) => void }) {
  const [active, setActive] = useState(false);
  return (
    <div
      className={`col-resize ${active ? "col-resize-active" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        let lastX = e.clientX;
        const z = uiZoom();
        const onMove = (ev: PointerEvent) => {
          onDelta((ev.clientX - lastX) / z);
          lastX = ev.clientX;
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          setActive(false);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, { once: true });
      }}
    />
  );
}

// Ширина колонки из localStorage с клампом в [min, max].
export function readWidth(
  key: string,
  def: number,
  min: number,
  max: number,
): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch {
    // приватный режим — дефолт
  }
  return def;
}
