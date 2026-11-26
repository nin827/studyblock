// Letter ciphers and the small number theory behind them. Pure: no DOM, no rng, no storage.
//
// Conventions: upper-case letters only, A = 0 ... Z = 25, all arithmetic mod 26. A shift or key
// may be negative or larger than 25; results always wrap into A-Z. Callers pass in the drawn
// values (this file never draws). Words must contain only A-Z.
//
// Cipher maps and key arithmetic only:
//   ALPHABET, UNITS26, letterNumber, numberLetter, caesar, vigenere, keyStream, affine,
//   gcd, lcm, gcdAll, lcmAll, modPos, modInverse (null when gcd(a, m) != 1)
// Independent checks (verify) stay in each module.

import { gcd, lcm, gcdAll, lcmAll } from './mathutil.js';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// The 12 multipliers a with gcd(a, 26) = 1 (valid affine keys), in order.
export const UNITS26 = Object.freeze([1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25]);

export const modPos = (a, n) => ((a % n) + n) % n;
export const letterNumber = c => c.charCodeAt(0) - 65;
export const numberLetter = i => String.fromCharCode(modPos(i, 26) + 65);
export const caesar = (w, k) => [...w].map(c => numberLetter(letterNumber(c) + k)).join('');
// Vigenere: each plaintext letter moves by the matching key letter (sign -1 decodes).
export const vigenere = (w, key, sign = 1) =>
  [...w].map((c, i) => numberLetter(letterNumber(c) + sign * letterNumber(key[i % key.length]))).join('');
// The key repeated to the word's length.
export const keyStream = (w, key) => [...w].map((_, i) => key[i % key.length]).join('');
// E(x) = (a*x + b) mod 26 on every letter.
export const affine = (w, a, b) => [...w].map(c => numberLetter(a * letterNumber(c) + b)).join('');

// gcd/lcm live in mathutil.js (one source of truth); re-exported so existing imports keep working.
export { gcd, lcm, gcdAll, lcmAll };

// Inverse of a mod m by the extended Euclidean algorithm; null when it does not exist.
export function modInverse(a, m) {
  let [r0, r1, s0, s1] = [m, modPos(a, m), 0, 1];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return r0 === 1 ? modPos(s0, m) : null;
}
