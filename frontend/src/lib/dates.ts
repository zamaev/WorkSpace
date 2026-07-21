// Все даты — локальные строки YYYY-MM-DD; сервер ими не оперирует.
// Разбор через new Date(iso) запрещён — он трактует ISO как UTC и
// сдвигает день в западных поясах; собираем Date из частей.

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function local(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

// Разница в днях b - a (целые дни, DST-безопасно через полдень).
export function dayDiff(a: string, b: string): number {
  const da = local(a);
  const db = local(b);
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const d = local(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Понедельник недели, в которую входит iso (неделя начинается с Пн).
export function mondayOf(iso: string): string {
  const d = local(iso);
  const shift = (d.getDay() + 6) % 7; // Вс=0 → 6, Пн=1 → 0
  return addDays(iso, -shift);
}

export function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// «Вт 21» — чип даты у узла дерева и заголовок колонки недели.
export function fmtDayChip(iso: string): string {
  const d = local(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

export const fmtDayHeader = fmtDayChip;

// «20–26 июля» / «27 июля – 2 августа»
export function fmtWeekRange(mondayIso: string): string {
  const a = local(mondayIso);
  const b = local(addDays(mondayIso, 6));
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}
