# Data Representation: how to solve

## General

- Work in bits first, then divide by 8 for bytes, then by the unit size.
- KB, MB, GB use 1000s; KiB, MiB, GiB use 1024s. The question always says which.
- When asked how many whole things fit, divide and round **down**.

## Images

1. Count the pixels: width × height.
2. Multiply by the colour depth (bits per pixel) to get bits.
3. Divide by 8 for bytes, then by the unit size.
4. For colours: n bits give 2^n colours. For a number of colours, find the smallest n with 2^n at least that many.

Example: 100 × 50 pixels at 8 bits = 40,000 bits = 5,000 bytes = 5 KB.

**Watch out:** 300 colours needs 9 bits, because 8 bits only give 256.

## Sound

1. Bits per second = sample rate × bit depth × channels.
2. Multiply by the length in seconds (turn minutes into seconds first).
3. Divide by 8 for bytes, then by the unit size.
4. To find a length, divide the size in bits by the bits per second.

Example: 1 second at 8,000 Hz, 8-bit, mono = 64,000 bits = 8,000 bytes.

**Watch out:** stereo doubles the size, because there are 2 channels.

## Characters

1. ASCII codes run in order: count on from the code you're given (`A` = 65, `a` = 97, `0` = 48).
2. For binary, go through 128, 64, 32, 16, 8, 4, 2, 1 and write a 1 where the place value fits.
3. Storage = number of characters × bits per character. Spaces count.
4. UTF-8: compare the code point with U+007F, U+07FF and U+FFFF to get 1, 2, 3 or 4 bytes.

Example: `C` is 2 after `A`, so its code is 67 = 01000011.

**Watch out:** the character `7` has code 55, not 7.

## Compression and storage

1. Ratio = original ÷ compressed. Saving % = (original − compressed) ÷ original × 100.
2. Run-length encoding: split into runs of the same character and write count + character for each run.
3. Decoding: repeat each character by the count in front of it.
4. To see how many files fit, put both sizes in the same unit, divide and round down.

Example: `WWWBBW` → `3W2B1W`.

**Watch out:** a run of 1 still needs its count, so RLE can make text longer.
