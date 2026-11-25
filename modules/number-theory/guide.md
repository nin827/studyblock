# Number Theory: how to solve

## General

- Every answer is a whole number, a choice, or a word or letter (cipher questions). There's no calculator, so keep the numbers small: reduce, factorise or use a rule before you multiply out.
- Quick tests save time: even last digit means divisible by 2, last digit 0 or 5 means divisible by 5, and a digit sum that's a multiple of 3 (or 9) means divisible by 3 (or 9).
- Writing a number as a product of primes unlocks most questions here.

## Primes & factors

1. To test whether n is prime, try dividing by the primes 2, 3, 5, 7, 11, ... up to √n. If none goes in exactly, n is prime.
2. To factorise, divide by the smallest prime that goes in, again and again, until you reach 1.
3. Collect the primes as powers: the number of times a prime divided in is its power.
4. To count factors, add 1 to each power and multiply the results.

Example: 72 = 2^3 × 3^2, so it has (3 + 1) × (2 + 1) = 12 factors.

**Watch out:** 91 = 7 × 13 and 119 = 7 × 17 look prime but aren't. Check 7, 11 and 13 too, not just 2, 3 and 5.

**Expert:** a factor of `2^a × 3^b × …` picks each power from 0 up to its maximum. Even factors need the power of 2 to be at least 1; square factors need every power even. Zeros at the end of n!: count multiples of 5, plus multiples of 25, plus 125. Trial division can stop at √n, because a factor pair always has one number at most √n.

## GCD & LCM

1. Write each number as a product of prime powers.
2. GCD: take only the primes every number shares, each with its **lowest** power.
3. LCM: take every prime that appears anywhere, each with its **highest** power.
4. In word problems, "as large as possible, dividing exactly" means GCD; "when do they line up again" means LCM.

Example: 12 = 2^2 × 3 and 18 = 2 × 3^2, so GCD = 2 × 3 = 6 and LCM = 2^2 × 3^2 = 36.

**Watch out:** for two numbers, GCD × LCM = the product of the numbers. Use it to check your answer, or to find a missing number.

**Expert:** with GCD g and LCM L, write a = gx, b = gy with x, y sharing no factor and xy = L ÷ g; each prime power of L ÷ g goes wholly to x or to y. With two coprime sizes a and b, the largest amount you can't make is ab − a − b. Numbers that leave the same remainder differ by multiples of the divisor, so take the GCD of the differences.

## Divisibility

1. Pick the rule for the divisor: 4 checks the last two digits, 8 the last three, 3 and 9 the digit sum, 11 the alternating digit sum.
2. For a divisor like 12 or 36, split it into coprime parts (3 and 4, or 4 and 9) and check both.
3. For a remainder, find the biggest multiple that fits and subtract, or use the rule's smaller number.
4. To count multiples of d from a to b, find the first and last multiples, then count from the first multiplier to the last, including both.

Example: 5,832 has digit sum 18, so it's divisible by 9; its last two digits, 32, are divisible by 4, so it's divisible by 36.

**Watch out:** passing one part of a combined test isn't enough. A number divisible by 3 isn't always divisible by 9.

**Expert:** split the divisor into coprime parts (36 = 4 × 9) and apply both rules to the missing digits, the last-digits rule first. For three divisors use inclusion–exclusion: singles − pairs + triple gives "at least one"; singles − 2 × pairs + 3 × triple gives "exactly one".

## Modular arithmetic

1. a mod n is the remainder from 0 to n − 1. For a negative number, add multiples of n until you're in that range.
2. In sums and products you can reduce each number mod n first, then reduce again at the end.
3. For clocks and weekdays, divide the shift by 12, 24 or 7 and only move by the remainder.
4. For a power, list the powers mod n (or the last digits) until they repeat, then use the exponent's remainder to find your place in the cycle.

Example: the last digits of powers of 7 go 7, 9, 3, 1 and repeat. 43 ÷ 4 leaves 3, so 7^43 ends in 3.

**Watch out:** a 12-hour clock shows 12, not 0. And when the exponent's remainder is 0, you're at the **end** of the cycle, not the start.

**Expert:** for a prime p not dividing a, a^(p−1) mod p = 1, so reduce the exponent mod p − 1. If a and n share a factor g in `ax mod n = b`, divide a, b and n by g; the solutions then repeat every n ÷ g, giving g of them. ISBN-10: 10 × d1 + 9 × d2 + … + 1 × d10 must be a multiple of 11.

## Ciphers

1. Number the letters A = 0, B = 1, …, Z = 25. A result of 26 or more wraps round (subtract 26); a negative one wraps the other way (add 26).
2. Caesar: every letter moves the same shift k. Encode by adding k, decode by subtracting it.
3. Vigenère: write the key under the word, repeating it. Each key letter's number is the shift for the letter above it.
4. To find a shift or key, subtract plaintext from ciphertext, letter by letter, and check with one more letter.

Example: shift 3 turns CAT into FDW (C→F, A→D, T→W). With key BE, HI becomes IM (H + 1 = I, I + 4 = M).

**Watch out:** A is a shift of 0, not 1. And if the encoder shifted backward, decoding goes forward.

**Expert:** an affine cipher sends x to (ax + b) mod 26. To decode, subtract b and multiply by the inverse of a mod 26. To crack it from two known letters, subtract the two equations to remove b, solve for a, then find b. For frequency analysis, assume the most common ciphertext letter is E.

## Keys & RSA

1. Count keys by multiplying the choices per position: n bits give 2^n keys, a 4-digit PIN gives 10^4. Each extra bit doubles the count.
2. For an inverse of a mod m, find the first of 1 + m, 1 + 2m, 1 + 3m, … that a divides exactly, and divide.
3. Toy RSA: n = p × q and φ(n) = (p − 1)(q − 1). The private key d is the inverse of e mod φ(n).
4. To encrypt, c = m^e mod n: multiply by m one step at a time and reduce mod n after every step, so the numbers stay small.

Example: p = 3, q = 11, e = 3 gives n = 33 and φ(n) = 20. (1 + 20) ÷ 3 = 7, so d = 7.

**Watch out:** a brute-force attacker finds the key after trying **half** the keys on average, and 2^20 ÷ 2^4 is 2^16: dividing powers of 2 subtracts the powers.

**Expert:** to break a toy key, factor n by trial division, then φ(n) and d as usual. e must share no factor with φ(n) (so it is always odd). Diffie–Hellman: each person sends g^secret mod p; the shared key is the received number raised to your own secret, mod p, reducing after every multiplication.
