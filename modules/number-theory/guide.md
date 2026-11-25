# Number Theory: how to solve

## General

- Every answer is a whole number or a choice, and there's no calculator, so keep the numbers small: reduce, factorise or use a rule before you multiply out.
- Quick tests save time: even last digit means divisible by 2, last digit 0 or 5 means divisible by 5, and a digit sum that's a multiple of 3 (or 9) means divisible by 3 (or 9).
- Writing a number as a product of primes unlocks most questions here.

## Primes & factors

1. To test whether n is prime, try dividing by the primes 2, 3, 5, 7, 11, ... up to √n. If none goes in exactly, n is prime.
2. To factorise, divide by the smallest prime that goes in, again and again, until you reach 1.
3. Collect the primes as powers: the number of times a prime divided in is its power.
4. To count factors, add 1 to each power and multiply the results.

Example: 72 = 2^3 × 3^2, so it has (3 + 1) × (2 + 1) = 12 factors.

**Watch out:** 91 = 7 × 13 and 119 = 7 × 17 look prime but aren't. Check 7, 11 and 13 too, not just 2, 3 and 5.

## GCD & LCM

1. Write each number as a product of prime powers.
2. GCD: take only the primes every number shares, each with its **lowest** power.
3. LCM: take every prime that appears anywhere, each with its **highest** power.
4. In word problems, "as large as possible, dividing exactly" means GCD; "when do they line up again" means LCM.

Example: 12 = 2^2 × 3 and 18 = 2 × 3^2, so GCD = 2 × 3 = 6 and LCM = 2^2 × 3^2 = 36.

**Watch out:** for two numbers, GCD × LCM = the product of the numbers. Use it to check your answer, or to find a missing number.

## Divisibility

1. Pick the rule for the divisor: 4 checks the last two digits, 8 the last three, 3 and 9 the digit sum, 11 the alternating digit sum.
2. For a divisor like 12 or 36, split it into coprime parts (3 and 4, or 4 and 9) and check both.
3. For a remainder, find the biggest multiple that fits and subtract, or use the rule's smaller number.
4. To count multiples of d from a to b, find the first and last multiples, then count from the first multiplier to the last, including both.

Example: 5,832 has digit sum 18, so it's divisible by 9; its last two digits, 32, are divisible by 4, so it's divisible by 36.

**Watch out:** passing one part of a combined test isn't enough. A number divisible by 3 isn't always divisible by 9.

## Modular arithmetic

1. a mod n is the remainder from 0 to n − 1. For a negative number, add multiples of n until you're in that range.
2. In sums and products you can reduce each number mod n first, then reduce again at the end.
3. For clocks and weekdays, divide the shift by 12, 24 or 7 and only move by the remainder.
4. For a power, list the powers mod n (or the last digits) until they repeat, then use the exponent's remainder to find your place in the cycle.

Example: the last digits of powers of 7 go 7, 9, 3, 1 and repeat. 43 ÷ 4 leaves 3, so 7^43 ends in 3.

**Watch out:** a 12-hour clock shows 12, not 0. And when the exponent's remainder is 0, you're at the **end** of the cycle, not the start.
