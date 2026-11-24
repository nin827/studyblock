// Seeded PRNG (mulberry32) + helpers.

export function randomSeed() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
}

export function createRng(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function int(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return min + Math.floor(next() * (max - min + 1));
  }
  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  return { seed: seed >>> 0, next, int, pick, shuffle };
}
