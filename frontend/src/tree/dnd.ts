// Общий формат drag-данных: id задачи в кастомном mime-типе,
// чтобы не конфликтовать с перетаскиванием текста.
export const TASK_MIME = "application/x-workspace-task";

export function setDragTask(e: React.DragEvent, id: number) {
  e.dataTransfer.setData(TASK_MIME, String(id));
  e.dataTransfer.effectAllowed = "move";
}

export function getDragTask(e: React.DragEvent): number | null {
  const raw = e.dataTransfer.getData(TASK_MIME);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function hasDragTask(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(TASK_MIME);
}

// Кастомный drag-снимок: клон строки с фоном панели и скруглениями —
// вместо системного прямоугольного полупрозрачного призрака.
export function setDragGhost(e: React.DragEvent, el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  const r = el.getBoundingClientRect();
  clone.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${r.width}px;box-sizing:border-box;background:var(--panel);border:1px solid var(--line);border-radius:12px;pointer-events:none;margin:0;`;
  document.body.appendChild(clone);
  e.dataTransfer.setDragImage(clone, e.clientX - r.left, e.clientY - r.top);
  setTimeout(() => clone.remove(), 0);
}
