# Cryptography Basics: how to solve

## General

- Number the letters A = 0, B = 1, …, Z = 25. Encoding adds a shift, decoding subtracts it.
- Results of 26 or more wrap round: subtract 26. Negative results: add 26.
- In the calculator, `%` gives a remainder: `17 % 5` is 2. For a negative number it keeps the minus sign, so add n afterwards.

## Caesar cipher

1. Write down the shift k.
2. To encode, move each letter k places forward. To decode, move each letter k places back.
3. To find an unknown shift, subtract the plaintext letter from the ciphertext letter, then check a second letter.
4. With no known pair, try the options: the shift must be the same for every letter.

Example: shift 3 turns CAT into FDW (C→F, A→D, T→W).

**Watch out:** if the encoder shifted backward, decoding goes forward.

## Vigenère cipher

1. Write the key under the word, repeating it until it is as long as the word.
2. Turn each key letter into a shift (A = 0, B = 1, …).
3. Encode by adding each shift to the letter above it; decode by subtracting.
4. To find the key, subtract plaintext from ciphertext letter by letter.

Example: HI with key BE: H + 1 = I, I + 4 = M, so HI becomes IM.

**Watch out:** A is a shift of 0, not 1.

## Modular arithmetic

1. For *a* mod *n*, find the biggest multiple of *n* that fits in *a* and keep what's left.
2. For a power, work it out, then take the remainder. If it's big, reduce after each multiplication.
3. For an inverse of *a* mod *m*, try (1 + k × *m*) ÷ *a* for k = 0, 1, 2, … until it is whole.
4. Toy RSA: n = p × q, φ(n) = (p − 1)(q − 1), d is the inverse of e mod φ(n), and c = m^e mod n.

Example: 3 × 5 = 15 = 2 × 7 + 1, so the inverse of 3 mod 7 is 5.

**Watch out:** a mod answer is always from 0 to n − 1, never negative.

## Key space and brute force

1. Count the keys: 2^bits for a binary key, or (symbols)^length for a code or password.
2. Time = keys ÷ keys per second. On average, only half the keys are needed.
3. Convert seconds to the unit asked for: 60 per minute, 3,600 per hour, 86,400 per day, 365 days per year.

Example: a 20-bit key has 2^20 = 1,048,576 keys; at 1,000 keys per second that is about 1,048.58 seconds.

**Watch out:** each extra bit doubles the key space, so 10 more bits is about 1,000 times more keys.
