# Cryptography Basics

Learn how secret messages work, from ciphers you can do on paper to the maths behind modern keys: Caesar and Vigenère ciphers, modular arithmetic and a toy version of RSA, and how long it takes to try every key.

## Answer formats

| You're asked for | Type it like |
| --- | --- |
| A word | the letters, like `APPLE` (capitals don't matter) |
| A shift | a whole number from 1 to 25 |
| A remainder (mod n) | a whole number from 0 to n − 1 |
| A count of keys | the whole number, like `1048576` (commas are fine) |
| A time | a number; each question says the unit and how to round |

## Key facts

- **Caesar cipher:** every letter moves the same number of places forward, wrapping from Z back to A. Decoding moves them back.
- **Vigenère cipher:** a keyword gives a different shift for each letter (A = 0, B = 1, …, Z = 25), and the key repeats along the word.
- **a mod n** is the remainder after dividing *a* by *n*. The calculator's `%` does this, but keeps a minus sign for negative numbers.
- **Toy RSA:** n = p × q, φ(n) = (p − 1)(q − 1), and the private key d satisfies (d × e) mod φ(n) = 1. Encrypt with c = m^e mod n. Real RSA uses primes hundreds of digits long.
- **Key space:** an n-bit key has 2^n possible keys. On average a brute-force search finds the key after trying half of them.

| Level | What to expect |
| --- | --- |
| Easy | Small shifts, short words, simple remainders, counting keys |
| Medium | Any shift, decoding, finding the shift, powers and inverses mod n, search times |
| Hard | Unknown shifts and keys, toy RSA, average search times, questions with several parts |
