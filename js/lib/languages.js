// Programming languages that code subjects (Code Writing, Code Reviewing) can be shown in.
// Pure data, no DOM. A module opts in with `"languages": [ids…]` in module.json; the user's pick is
// the `sb_codeLang` cookie (default python). `fence` is the markdown code-fence tag.

export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'python', title: 'Python', fence: 'python' }),
  Object.freeze({ id: 'csharp', title: 'C#', fence: 'csharp' }),
  Object.freeze({ id: 'cpp', title: 'C++', fence: 'cpp' }),
  Object.freeze({ id: 'gdscript', title: 'GDScript', fence: 'gdscript' }),
  Object.freeze({ id: 'rust', title: 'Rust', fence: 'rust' }),
]);

export const DEFAULT_LANG = 'python';
export const LANG_IDS = Object.freeze(LANGUAGES.map(l => l.id));

export const isLang = id => typeof id === 'string' && LANG_IDS.includes(id);
export const langTitle = id => (LANGUAGES.find(l => l.id === id) || {}).title || '';
