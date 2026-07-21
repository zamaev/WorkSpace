// Русская плюрализация: «1 задача · 2 задачи · 5 задач».
// Intl.PluralRules — вместо ручных остатков от деления (11/111 и прочие ловушки).
const rules = new Intl.PluralRules("ru-RU");

export function pluralWord(n: number, forms: [string, string, string]): string {
  switch (rules.select(n)) {
    case "one":
      return forms[0];
    case "few":
      return forms[1];
    default:
      return forms[2];
  }
}

export function plural(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralWord(n, forms)}`;
}
