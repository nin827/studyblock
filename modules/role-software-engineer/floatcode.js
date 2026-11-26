// Per-language snippets for the ledger-check float bug (Software Engineer scenarios).
// codelang.js has no float type, so these few lines are hand-written templates, one per language in
// js/lib/languages.js. They hold the same logic everywhere: add the matched amounts as doubles, then
// turn the total into whole cents. Every language here uses IEEE double precision (Python float, C#
// double, C++ double, GDScript float, Rust f64, JavaScript/TypeScript number, Java double, Go float64),
// so the same amounts give the same total and the same cents. The frames (C# top-level statements,
// C++ main, GDScript _ready, Rust main, JS/TS top level, Java 25 compact `void main()`, Go main) match
// codelang's. Every round function here rounds halves away from zero or up, the same for these
// positive amounts.
//
//   floatSnippet(lang, amounts)  the whole program text; its `cents` line is the old, truncating one
//   fixCode(id, lang)            the `cents` line for fix `id` (also the text of a choice option)
//   castNote(lang) wording for the prompt; cutName(lang) the truncating cast

const GD_FRAME = "extends Node\n\nfunc _ready() -> void:\n";

// What each language needs, as small functions over expression strings.
//   n(x)     a number literal of the right kind   cut(e)  drop the fraction (towards zero)
//   rnd(e)   nearest whole number                  sum(f)  add f(a) over every amount
//   decl(e)  the final `cents` line
const castC = (e) => (/^\w+$/.test(e) ? `(int)${e}` : `(int)(${e})`); // C-style cast, brackets only when needed
const LANGS = {
  python: {
    n: (x) => String(x), cut: (e) => `int(${e})`, rnd: (e) => `round(${e})`,
    sum: (f) => `sum(${f("a")} for a in amounts)`, decl: (e) => `cents = ${e}`,
    cutName: "int()", roundName: "round()",
    head: (list) => `amounts = [${list}]\ntotal = 0.0\nfor a in amounts:\n    total += a\n`,
    wrap: (head, last) => head + last,
  },
  csharp: {
    n: (x) => String(x), cut: castC, rnd: (e) => `(int)Math.Round(${e})`,
    sum: (f) => `amounts.Sum(a => ${f("a")})`, decl: (e) => `int cents = ${e};`,
    cutName: "(int)", roundName: "Math.Round()",
    head: (list) => `double[] amounts = { ${list} };\ndouble total = 0.0;\nforeach (double a in amounts)\n{\n    total += a;\n}\n`,
    wrap: (head, last) => head + last,
  },
  cpp: {
    n: (x) => String(x), cut: castC, rnd: (e) => `(int)std::round(${e})`,
    sum: (f) => `std::accumulate(amounts.begin(), amounts.end(), 0, [](int s, double a) { return s + ${f("a")}; })`,
    decl: (e) => `int cents = ${e};`,
    cutName: "(int)", roundName: "std::round()",
    head: (list) => `    std::vector<double> amounts = {${list}};\n    double total = 0.0;\n    for (double a : amounts) {\n        total += a;\n    }\n`,
    wrap: (head, last) => `int main() {\n${head}    ${last}\n}`,
  },
  gdscript: {
    n: (x) => String(x), cut: (e) => `int(${e})`, rnd: (e) => `roundi(${e})`,
    sum: (f) => `amounts.map(func(a): return ${f("a")}).reduce(func(s, a): return s + a, 0)`,
    decl: (e) => `var cents: int = ${e}`,
    cutName: "int()", roundName: "roundi()",
    head: (list) => `    var amounts: Array[float] = [${list}]\n    var total: float = 0.0\n    for a in amounts:\n        total += a\n`,
    wrap: (head, last) => `${GD_FRAME}${head}    ${last}`,
  },
  rust: {
    n: (x) => `${x}.0`, cut: (e) => `${/^\w+$/.test(e) ? e : `(${e})`} as i64`, rnd: (e) => `${/^\w+$/.test(e) ? e : `(${e})`}.round() as i64`,
    sum: (f) => `amounts.iter().map(|a| ${f("*a")}).sum::<i64>()`, decl: (e) => `let cents = ${e};`,
    cutName: "as i64", roundName: ".round()",
    head: (list) => `    let amounts: Vec<f64> = vec![${list}];\n    let mut total: f64 = 0.0;\n    for a in &amounts {\n        total += a;\n    }\n`,
    wrap: (head, last) => `fn main() {\n${head}    ${last}\n}`,
  },
  javascript: {
    n: (x) => String(x), cut: (e) => `Math.trunc(${e})`, rnd: (e) => `Math.round(${e})`,
    sum: (f) => `amounts.reduce((s, a) => s + ${f("a")}, 0)`, decl: (e) => `const cents = ${e};`,
    cutName: "Math.trunc()", roundName: "Math.round()",
    head: (list) => `const amounts = [${list}];\nlet total = 0;\nfor (const a of amounts) {\n    total += a;\n}\n`,
    wrap: (head, last) => head + last,
  },
  typescript: {
    n: (x) => String(x), cut: (e) => `Math.trunc(${e})`, rnd: (e) => `Math.round(${e})`,
    sum: (f) => `amounts.reduce((s, a) => s + ${f("a")}, 0)`, decl: (e) => `const cents: number = ${e};`,
    cutName: "Math.trunc()", roundName: "Math.round()",
    head: (list) => `const amounts: number[] = [${list}];\nlet total: number = 0;\nfor (const a of amounts) {\n    total += a;\n}\n`,
    wrap: (head, last) => head + last,
  },
  java: {
    n: (x) => String(x), cut: castC, rnd: (e) => `(int)Math.round(${e})`,
    sum: (f) => `Arrays.stream(amounts).mapToInt(a -> ${f("a")}).sum()`, decl: (e) => `int cents = ${e};`,
    cutName: "(int)", roundName: "Math.round()",
    head: (list) => `    double[] amounts = {${list}};\n    double total = 0.0;\n    for (double a : amounts) {\n        total += a;\n    }\n`,
    wrap: (head, last) => `void main() {\n${head}    ${last}\n}`,
  },
  go: {
    // Go has no one-line sum, so the snippet carries a small sumOf helper for the fixes that add per amount;
    // `total` and `cents` are printed because Go rejects a variable that is never read (`total += a`
    // alone doesn't count, and some fixes don't read `total`).
    n: (x) => String(x), cut: (e) => `int(${e})`, rnd: (e) => `int(math.Round(${e}))`,
    sum: (f) => `sumOf(amounts, func(a float64) int { return ${f("a")} })`, decl: (e) => `cents := ${e}`,
    cutName: "int()", roundName: "math.Round()",
    head: (list) => `    amounts := []float64{${list}}\n    total := 0.0\n    for _, a := range amounts {\n        total += a\n    }\n`,
    wrap: (head, last) => `// sumOf adds up f(x) for every x in xs.\nfunc sumOf(xs []float64, f func(float64) int) int {\n    s := 0\n` +
      `    for _, x := range xs {\n        s += f(x)\n    }\n    return s\n}\n\nfunc main() {\n${head}    ${last}\n    fmt.Println(total, cents)\n}`,
  },
};

// The right-hand side of the `cents` line for each fix id (ok / right ones first, then the bugs).
const FIX_EXPR = {
  ok: (L) => L.sum((a) => L.rnd(`${a} * ${L.n(100)}`)),
  round100: (L) => L.rnd(`total * ${L.n(100)}`),
  halfUp: (L) => L.cut(`total * ${L.n(100)} + 0.5`),
  old: (L) => L.cut(`total * ${L.n(100)}`),
  intTotal: (L) => `${L.cut("total")} * 100`,
  itemTrunc: (L) => L.sum((a) => L.cut(`${a} * ${L.n(100)}`)),
  roundTotal: (L) => L.rnd("total"),
  tenths: (L) => `${L.cut(`total * ${L.n(10)}`)} * 10`,
  sumInt: (L) => `${L.sum((a) => L.cut(a))} * 100`,
};

const lang = (id) => LANGS[id] || LANGS.python;

// The `cents` line for fix `id` (a key of FIX_EXPR) in language `langId`.
export function fixCode(id, langId) {
  const L = lang(langId);
  return L.decl(FIX_EXPR[id](L));
}

// The whole snippet for the old, buggy code. `amounts` are decimal strings like "12.50".
export function floatSnippet(langId, amounts) {
  const L = lang(langId);
  return L.wrap(L.head(amounts.join(", ")), fixCode("old", langId));
}

export const cutName = (id) => lang(id).cutName;
export const roundName = (id) => lang(id).roundName;
// "`int()` drops everything after the point; `round()` gives the nearest whole number"
export const castNote = (id) => `\`${cutName(id)}\` drops everything after the point and \`${roundName(id)}\` gives the nearest whole number`;
