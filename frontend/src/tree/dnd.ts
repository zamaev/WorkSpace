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
