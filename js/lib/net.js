// IPv4 and subnet knowledge. Pure: no DOM, no rng, no storage.
//
// An address is held either as OCTETS (an array of four numbers 0-255) or as a 32-bit unsigned
// INT; each function says which it takes. A prefix `n` is the number after the slash (0-32).
// Callers pass in drawn values; nothing here draws. Conventions a module applies on top (usable
// hosts reserve the network and broadcast addresses; /31 and /32 handling) are stated by
// `usableHosts` below and chosen by the module. Independent checks (verify) stay in each module.
//
//   Format/convert: formatIPv4(octets | int), octetsToInt, intToOctets, bin8, binDotted
//   Masks:          maskOctets(n), maskInt(n), wildcardOctets(n)
//   Subnets:        blockSize(n), subnetOctets(ip, n) -> { net, bc, k, block } (octets),
//                   subnetInts(ip, n) -> { net, bc } (ints), sameSubnet(a, b, n) (ints)
//   Counting:       addressCount(n), usableHosts(n) = 2^(32-n) - 2
//   Arithmetic:     addToOctets(octets, delta) (with carry, may be negative)

import { bin8 } from './mathutil.js';

const pow2 = k => Math.pow(2, k);

export const octetsToInt = o => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
export const intToOctets = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
export const formatIPv4 = a => (Array.isArray(a) ? a : intToOctets(a)).join('.');
// bin8 lives in mathutil.js; re-exported so existing imports keep working.
export { bin8 };
export const binDotted = o => o.map(bin8).join('.');

// Mask octets for /n: each octet holds `bits` ones, worth 256 - 2^(8 - bits).
export function maskOctets(n) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const bits = Math.max(0, Math.min(8, n - 8 * i));
    out.push(256 - pow2(8 - bits));
  }
  return out;
}
export const maskInt = n => (n <= 0 ? 0 : (0xffffffff << (32 - n)) >>> 0);
// The mask with every bit flipped.
export const wildcardOctets = n => maskOctets(n).map(x => 255 - x);

export const blockSize = n => pow2(8 - (n % 8));
// Network / broadcast octets of ip/n using the block size in the octet where host bits start
// (k = index of that octet).
export function subnetOctets(ip, n) {
  const k = Math.floor(n / 8);
  const block = blockSize(n);
  const net = [], bc = [];
  for (let i = 0; i < 4; i++) {
    if (i < k) { net.push(ip[i]); bc.push(ip[i]); }
    else if (i === k) { const s = Math.floor(ip[i] / block) * block; net.push(s); bc.push(s + block - 1); }
    else { net.push(0); bc.push(255); }
  }
  return { net, bc, k, block };
}
// Network and broadcast as 32-bit ints for an address held as an int.
export function subnetInts(ip, n) {
  const net = (ip & maskInt(n)) >>> 0;
  return { net, bc: (net + pow2(32 - n) - 1) >>> 0 };
}
export const sameSubnet = (a, b, n) => ((a & maskInt(n)) >>> 0) === ((b & maskInt(n)) >>> 0);

export const addressCount = n => pow2(32 - n);
export const usableHosts = n => pow2(32 - n) - 2;

// Add a (possibly negative) offset to an address held as octets, with carry.
export function addToOctets(o, delta) {
  const out = o.slice();
  let carry = delta;
  for (let i = 3; i >= 0 && carry !== 0; i--) {
    const v = out[i] + carry;
    out[i] = ((v % 256) + 256) % 256;
    carry = Math.floor(v / 256);
  }
  return out;
}
