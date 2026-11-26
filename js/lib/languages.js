// Programming languages that code subjects (Code Writing, Code Reviewing, Role Software Engineer) can be
// shown in. Pure data, no DOM. A module opts in with `"languages": [ids…]` in module.json; the user's
// pick is the `sb_codeLang` cookie (default python). `fence` is the markdown code-fence tag.
// `industry`: an industry-standard language (roles only use these; GDScript is the one that isn't).

export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'python', title: 'Python', fence: 'python', industry: true }),
  Object.freeze({ id: 'csharp', title: 'C#', fence: 'csharp', industry: true }),
  Object.freeze({ id: 'cpp', title: 'C++', fence: 'cpp', industry: true }),
  Object.freeze({ id: 'gdscript', title: 'GDScript', fence: 'gdscript', industry: false }),
  Object.freeze({ id: 'rust', title: 'Rust', fence: 'rust', industry: true }),
  Object.freeze({ id: 'javascript', title: 'JavaScript', fence: 'javascript', industry: true }),
  Object.freeze({ id: 'typescript', title: 'TypeScript', fence: 'typescript', industry: true }),
  Object.freeze({ id: 'java', title: 'Java', fence: 'java', industry: true }),
  Object.freeze({ id: 'go', title: 'Go', fence: 'go', industry: true }),
]);

export const DEFAULT_LANG = 'python';
export const LANG_IDS = Object.freeze(LANGUAGES.map(l => l.id));

export const isLang = id => typeof id === 'string' && LANG_IDS.includes(id);
export const langTitle = id => (LANGUAGES.find(l => l.id === id) || {}).title || '';
export const isIndustryLang = id => !!(LANGUAGES.find(l => l.id === id) || {}).industry;
