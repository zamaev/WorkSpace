import type { RepeatRule, Task } from "../data/types";
import { addDays } from "./dates";

export const DOW_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

// ISO-день недели даты (1=пн … 7=вс)
export function isoDow(iso: string): number {
  const d = new Date(`${iso}T00:00:00`).getDay();
  return d === 0 ? 7 : d;
}

export function fmtRepeatDays(rule: RepeatRule): string {
  return rule.days.map((d) => DOW_SHORT[d]).join(" · ");
}

// Будущие «призрачные» вхождения серии в [from..to] — строго после
// плановой даты живой задачи; в БД их нет, материализация — через
// done/перенос.
export function ghostOccurrences(
  task: Task,
  from: string,
  to: string,
  today: string,
): string[] {
  if (!task.repeat || !task.scheduledOn || task.done) return [];
  // спавн на бэке считается строго после max(план, сегодня) — призраки
  // для просроченной задачи в прошлом и «сегодня» не рисуются
  const base = task.scheduledOn > today ? task.scheduledOn : today;
  const out: string[] = [];
  let cur = base > from ? base : from;
  // идём по дням: диапазоны недели/шкалы Ганта короткие
  while (cur <= to) {
    if (cur > base && task.repeat.days.includes(isoDow(cur))) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
