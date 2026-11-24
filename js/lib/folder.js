// Optional data folder (File System Access API, Chromium only).
//
// - The directory handle lives in IndexedDB (db "studyblock", store "handles"); a small marker
//   (cookie sb_folder, or the studyblock:prefs key on file://) holds the folder's display name so
//   the UI can say "Connected to <name>" before IndexedDB answers.
// - The app touches only studyblock-data.json in that folder: it never lists, reads or deletes
//   any other file. The file has the export shape and is validated exactly like an import.
// - localStorage stays the working cache. Every save schedules a debounced write (~1s).
//   createWritable() writes to a browser-managed swap file and swaps it in on close(), so the
//   target is never left half-written; we don't create temp files of our own.
// - On connect / reconnect the folder file is merged into the cache (dedupe by id), then the
//   merged result is written back. A folder file that fails validation is never overwritten.
// - Never opens the folder picker by itself; never throws to callers (errors become a message).

import { snapshot, importText, onSaved, getCookie, setCookie, deleteCookie } from './storage.js';

const FILE_NAME = 'studyblock-data.json';
const DB_NAME = 'studyblock';
const STORE = 'handles';
const HANDLE_KEY = 'dataFolder';
const MARKER = 'folder';                       // sb_folder cookie / prefs key: folder display name
const SYNC_KEY = 'studyblock:folderSync';      // localStorage: last successful sync (ms)
const DENIED_KEY = 'studyblock:folderDenied';  // sessionStorage: user said no this session
const WRITE_DELAY = 1000;

const events = new EventTarget();
const state = {
  ready: false,         // init() has finished checking IndexedDB / permission
  status: 'none',       // 'unsupported' | 'none' | 'needs-permission' | 'connected'
  name: '',
  lastSync: readLastSync(),
  message: '',
  messageKind: '',      // '' | 'good' | 'bad'
  blocked: false,       // folder file is invalid: don't overwrite it
  denied: false,        // permission refused this session: don't auto-ask again
};
let handle = null;
let timer = null;
let busy = null;        // in-flight connect/reconnect/sync promise
let armed = false;

export function isSupported() {
  try {
    return typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function readLastSync() {
  try {
    const n = Number(localStorage.getItem(SYNC_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function cleanName(n) {
  return String(n ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 80);
}

function markerName() {
  const v = getCookie(MARKER);
  return v ? cleanName(v) : '';
}

function setMessage(text, kind = '') {
  state.message = text;
  state.messageKind = kind;
}

function emit(detail = {}) {
  events.dispatchEvent(new CustomEvent('change', { detail }));
}

// fn({ ...info(), merged? }) on every state change. Returns an unsubscribe function.
export function subscribe(fn) {
  const h = e => { try { fn({ ...info(), ...e.detail }); } catch (err) { console.error(err); } };
  events.addEventListener('change', h);
  return () => events.removeEventListener('change', h);
}

export function status() {
  return state.status;
}

export function info() {
  return {
    ready: state.ready, status: state.status, name: state.name, lastSync: state.lastSync,
    message: state.message, messageKind: state.messageKind, blocked: state.blocked, denied: state.denied,
  };
}

// ---- IndexedDB (handle storage only) ----

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'));
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

const idbGet = () => idb('readonly', s => s.get(HANDLE_KEY));
const idbPut = h => idb('readwrite', s => s.put(h, HANDLE_KEY));
const idbDelete = () => idb('readwrite', s => s.delete(HANDLE_KEY));

// ---- permission ----

async function queryPerm(h) {
  try {
    if (typeof h.queryPermission !== 'function') return 'granted';
    return await h.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'prompt';
  }
}

function setDenied() {
  state.denied = true;
  try { sessionStorage.setItem(DENIED_KEY, '1'); } catch { /* ignore */ }
}

function deniedThisSession() {
  try { return sessionStorage.getItem(DENIED_KEY) === '1'; } catch { return false; }
}

// First natural click / key press anywhere re-grants access (requestPermission needs a gesture).
// Elements marked [data-folder-skip] (the folder buttons themselves) handle the click on their own.
function onGesture(e) {
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('[data-folder-skip]')) return;
  if (navigator.userActivation && !navigator.userActivation.isActive) return; // e.g. touch pointerdown, Esc
  disarm();
  reconnect();
}

function arm() {
  if (armed || state.denied) return;
  armed = true;
  for (const t of ['pointerdown', 'keydown', 'click']) window.addEventListener(t, onGesture, true);
}

function disarm() {
  if (!armed) return;
  armed = false;
  for (const t of ['pointerdown', 'keydown', 'click']) window.removeEventListener(t, onGesture, true);
}

// ---- file access (studyblock-data.json only) ----

// Text of studyblock-data.json, or null when it doesn't exist yet.
export async function read() {
  if (!handle) throw new Error('No data folder connected.');
  let fh;
  try {
    fh = await handle.getFileHandle(FILE_NAME);
  } catch (e) {
    if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
    throw e;
  }
  const file = await fh.getFile();
  return file.text();
}

export async function write(data) {
  if (!handle) throw new Error('No data folder connected.');
  if (state.blocked) throw new Error(`${FILE_NAME} in the folder is not valid StudyBlock data, so it was not overwritten.`);
  const text = JSON.stringify(data, null, 2);
  const fh = await handle.getFileHandle(FILE_NAME, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(text);
    await w.close();
  } catch (e) {
    try { await w.abort(); } catch { /* ignore */ }
    throw e;
  }
}

function markSynced() {
  state.lastSync = Date.now();
  try { localStorage.setItem(SYNC_KEY, String(state.lastSync)); } catch { /* ignore */ }
}

function describe(e) {
  if (!e) return 'Unknown error.';
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'Permission to the folder was not granted.';
  return e.message || String(e);
}

function onWriteError(e) {
  console.error('StudyBlock: data folder write failed', e);
  if (e && e.name === 'NotAllowedError') {
    state.status = 'needs-permission';
    if (!state.denied) arm();
  }
  setMessage(`Could not save to the data folder: ${describe(e)}`, 'bad');
}

// Merge the folder file into the cache, then write the merged result back.
async function sync() {
  let merged = null;
  try {
    const text = await read();
    if (text !== null && text.trim() !== '') {
      try {
        merged = importText(text, 'merge');
      } catch (e) {
        state.blocked = true;
        setMessage(`${FILE_NAME} in "${state.name}" could not be read as StudyBlock data (${e.message || e}). It was left untouched; fix or move it, then reconnect.`, 'bad');
        emit();
        return;
      }
    }
    state.blocked = false;
    clearTimeout(timer);
    timer = null;
    await write(snapshot());
    markSynced();
    setMessage('');
    emit(merged && (merged.added || merged.presetsAdded) ? { merged } : {});
  } catch (e) {
    onWriteError(e);
    emit();
  }
}

// ---- debounced writes after every save ----

function scheduleWrite() {
  if (state.status !== 'connected' || state.blocked || !handle) return;
  clearTimeout(timer);
  timer = setTimeout(flush, WRITE_DELAY);
}

async function flush() {
  clearTimeout(timer);
  timer = null;
  if (state.status !== 'connected' || state.blocked || !handle) return;
  try {
    await write(snapshot());
    markSynced();
    if (state.messageKind === 'bad') setMessage('');
  } catch (e) {
    onWriteError(e);
  }
  emit();
}

// ---- public actions ----

// Called once at boot. Restores the handle and syncs silently if permission is still granted.
export async function init() {
  if (state.ready) return info();
  if (!isSupported()) {
    state.status = 'unsupported';
    state.ready = true;
    emit();
    return info();
  }
  state.denied = deniedThisSession();
  // Instant guess from the marker so the UI doesn't flash a "connect" banner.
  const marked = markerName();
  if (marked) { state.status = 'connected'; state.name = marked; }
  onSaved(scheduleWrite);
  window.addEventListener('pagehide', () => { if (timer) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) flush(); });

  try {
    handle = (await idbGet()) || null;
  } catch (e) {
    console.warn('StudyBlock: could not read the data folder handle', e);
    handle = null;
  }
  if (!handle || typeof handle.getFileHandle !== 'function') {
    handle = null;
    state.status = 'none';
    state.name = '';
    if (marked) deleteCookie(MARKER);
    state.ready = true;
    emit();
    return info();
  }
  state.name = cleanName(handle.name);
  if (state.name && state.name !== marked) setCookie(MARKER, state.name);
  const perm = await queryPerm(handle);
  state.ready = true;
  if (perm === 'granted') {
    state.status = 'connected';
    emit();
    busy = sync().finally(() => { busy = null; });
    await busy;
  } else {
    state.status = 'needs-permission';
    if (perm === 'denied') setDenied();
    else arm();
    emit();
  }
  return info();
}

// Opens the folder picker. Must be called from a click handler.
export async function connect() {
  if (!isSupported()) {
    setMessage('This browser cannot connect a data folder. Use Export / Import instead.', 'bad');
    emit();
    return info();
  }
  let picked;
  try {
    picked = await window.showDirectoryPicker({ id: 'studyblock-data', mode: 'readwrite' });
  } catch (e) {
    if (e && e.name === 'AbortError') return info(); // user cancelled
    setMessage(`Could not open the folder: ${describe(e)}`, 'bad');
    emit();
    return info();
  }
  disarm();
  handle = picked;
  state.name = cleanName(picked.name);
  state.denied = false;
  try { sessionStorage.removeItem(DENIED_KEY); } catch { /* ignore */ }
  try {
    await idbPut(picked);
  } catch (e) {
    console.warn('StudyBlock: could not remember the data folder', e);
    setMessage('Connected, but the browser could not remember the folder for next time.', 'bad');
  }
  setCookie(MARKER, state.name);
  state.status = 'connected';
  state.blocked = false;
  emit();
  busy = sync().finally(() => { busy = null; });
  await busy;
  return info();
}

// Re-grants access to the remembered folder. Needs a user gesture (click / key press).
export function reconnect() {
  if (busy) return busy.then(info);
  busy = (async () => {
    try {
      if (!handle) {
        try { handle = (await idbGet()) || null; } catch { handle = null; }
      }
      if (!handle) {
        state.status = isSupported() ? 'none' : 'unsupported';
        setMessage('No data folder is remembered. Connect one first.', 'bad');
        emit();
        return;
      }
      let perm;
      try {
        perm = typeof handle.requestPermission === 'function'
          ? await handle.requestPermission({ mode: 'readwrite' })
          : 'granted';
      } catch (e) {
        // No user activation, or the folder is gone. Keep the button as a fallback.
        console.warn('StudyBlock: requestPermission failed', e);
        perm = 'prompt';
        setMessage(`Could not reconnect: ${describe(e)}`, 'bad');
      }
      if (perm !== 'granted') {
        state.status = 'needs-permission';
        setDenied();
        disarm();
        emit();
        return;
      }
      disarm();
      state.status = 'connected';
      state.blocked = false;
      setMessage('');
      emit();
      await sync();
    } catch (e) {
      setMessage(`Could not reconnect: ${describe(e)}`, 'bad');
      emit();
    }
  })().finally(() => { busy = null; });
  return busy.then(info);
}

// Forgets the folder (IndexedDB handle + marker). Never touches the folder's contents.
export async function disconnect() {
  disarm();
  clearTimeout(timer);
  timer = null;
  handle = null;
  try { await idbDelete(); } catch (e) { console.warn('StudyBlock: could not forget the data folder handle', e); }
  deleteCookie(MARKER);
  try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
  state.status = isSupported() ? 'none' : 'unsupported';
  state.name = '';
  state.lastSync = null;
  state.blocked = false;
  setMessage('Data folder disconnected. Your progress stays in this browser.', 'good');
  emit();
  return info();
}
