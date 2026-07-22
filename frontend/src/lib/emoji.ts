// В поле «свой смайлик» живёт ровно один эмодзи: берём последний grapheme
// (Intl.Segmenter не режет составные последовательности вроде 👨‍💻).
export function lastGrapheme(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  const segs = [...new Intl.Segmenter("ru", { granularity: "grapheme" }).segment(trimmed)];
  return segs.length > 0 ? segs[segs.length - 1].segment : "";
}
