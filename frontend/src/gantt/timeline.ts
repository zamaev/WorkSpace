import { addDays } from "../lib/dates";

// Математика шкалы Ганта: перевод дат в пиксели и обратно.
// Все входы — локальные YYYY-MM-DD строки, как везде в приложении.

export const DAY_W = 26; // ширина дня, px
export const NAME_W = 240; // ширина колонки названий, px

export type Scale = {
  start: string; // первый день шкалы
  days: number; // всего дней
};

function local(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Разница в днях b - a (целые дни, DST-безопасно через полдень).
export function dayDiff(a: string, b: string): number {
  const da = local(a);
  const db = local(b);
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

// Диапазон шкалы: все даты + запас; минимум — рабочее окно вокруг сегодня.
export function buildScale(dates: string[], todayIso: string): Scale {
  let min = todayIso;
  let max = todayIso;
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const start = addDays(min, -7);
  let end = addDays(max, 21);
  const minEnd = addDays(todayIso, 35);
  if (end < minEnd) end = minEnd;
  return { start, days: dayDiff(start, end) + 1 };
}

export function dayIndex(scale: Scale, iso: string): number {
  return dayDiff(scale.start, iso);
}

export function xOf(scale: Scale, iso: string): number {
  return dayIndex(scale, iso) * DAY_W;
}

export function dayAt(scale: Scale, index: number): string {
  return addDays(scale.start, index);
}

// Сегменты месяцев для шапки: подпись + ширина в днях.
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function monthSegments(scale: Scale): { label: string; days: number }[] {
  const out: { label: string; days: number }[] = [];
  for (let i = 0; i < scale.days; i++) {
    const d = local(dayAt(scale, i));
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (out.length > 0 && out[out.length - 1].label === label) {
      out[out.length - 1].days++;
    } else {
      out.push({ label, days: 1 });
    }
  }
  return out;
}

// Смещение первой субботы от начала шкалы (для подсветки выходных фоном).
export function saturdayOffset(scale: Scale): number {
  const dow = local(scale.start).getDay(); // Вс=0 … Сб=6
  return (6 - dow + 7) % 7;
}
