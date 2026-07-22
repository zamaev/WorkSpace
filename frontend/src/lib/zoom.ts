// Текущий CSS-zoom корня (медиапороги широких экранов в index.css).
// Событийные координаты (clientX/Y, getBoundingClientRect) приходят в
// viewport-пикселях, а инлайновые размеры/координаты браузер ещё раз
// умножает на zoom — все дельты и fixed-позиции надо приводить.
export function uiZoom(): number {
  const z = Number(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}
