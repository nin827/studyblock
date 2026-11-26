# Number Theory

Number theory is the study of whole numbers: which ones are prime, how numbers split into factors, what they have in common, and what is left over when you divide. It's also the maths behind secret codes, from ciphers you can do on paper to a toy version of RSA. It's all done by hand, so there's no calculator in this subject.

| Topic | What you'll practise |
| --- | --- |
| Primes & factors | Spotting primes, prime factorisations like `2^3 × 3^2 × 5`, counting factors |
| GCD & LCM | Greatest common divisor and lowest common multiple, including word problems |
| Divisibility | Divisibility rules, remainders, missing digits, counting multiples |
| Modular arithmetic | `a mod n`, clock and calendar puzzles, last digits of powers, simple congruences |
| Ciphers | Caesar and Vigenère ciphers: encoding, decoding, and finding a shift or key |
| Keys & RSA | Counting keys (2^n for n bits), inverses mod 26, and toy RSA with small primes |

**Answer formats**

- Number answers are **whole numbers**; commas like `1,024` are fine.
- Cipher answers are **words or letters**, like `APPLE`; capitals don't matter.
- `p^k` means p to the power k, so `2^3 × 5` is 2 × 2 × 2 × 5 = 40.
- **a mod n** is the remainder when a is divided by n, always from 0 to n − 1.
- A **12-hour clock** shows 1 to 12 (never 0); a **24-hour clock** shows 0 to 23.
- "Factors" means positive factors, including 1 and the number itself.
- In ciphers, letters are numbered **A = 0, B = 1, …, Z = 25**, and they wrap from Z back to A.

**Expert** questions have two or three parts and combine ideas, still by hand: counting even and square factors, zeros at the end of n!, how far trial division must go, every pair with a given GCD and LCM, amounts you can't make from two coin sizes, Fermat's little theorem, congruences with several solutions, ISBN check digits, affine ciphers (decoding and cracking the key), frequency analysis, breaking a toy RSA key and a toy Diffie–Hellman exchange.

> [!TIP]
> GCD (greatest common divisor) and HCF (highest common factor) are two names for the same thing.

Real RSA uses primes hundreds of digits long; the toy versions here use primes below 20 so every step can be done on paper.
