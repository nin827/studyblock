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

**Expert: palettes, video and working backwards.** An indexed image stores a palette number per pixel (the fewest bits for all the colours) plus a palette of colours × 3 bytes. A video is frames × frame size; its data rate is bits per frame × frames per second. From a file size and an aspect ratio a:b, find the pixels (bits ÷ depth), then width = ak and height = bk with ab × k² = pixels.

## Sound

1. Bits per second = sample rate × bit depth × channels.
2. Multiply by the length in seconds (turn minutes into seconds first).
3. Divide by 8 for bytes, then by the unit size.
4. To find a length, divide the size in bits by the bits per second.

Example: 1 second at 8,000 Hz, 8-bit, mono = 64,000 bits = 8,000 bytes.

**Watch out:** stereo doubles the size, because there are 2 channels.

**Expert: sample rates.** A rate captures sounds up to half its value (the Nyquist limit), so to capture F kHz you need at least 2F kHz. Rearrange size = rate × depth × channels × seconds to find any missing value. For time on a card, divide the card's bytes by the bytes per minute and round down.

## Characters

1. ASCII codes run in order: count on from the code you're given (`A` = 65, `a` = 97, `0` = 48).
2. For binary, go through 128, 64, 32, 16, 8, 4, 2, 1 and write a 1 where the place value fits.
3. Storage = number of characters × bits per character. Spaces count.
4. UTF-8: compare the code point with U+007F, U+07FF and U+FFFF to get 1, 2, 3 or 4 bytes.

Example: `C` is 2 after `A`, so its code is 67 = 01000011.

**Watch out:** the character `7` has code 55, not 7.

**Expert: UTF-8 bytes.** Layouts: `110xxxxx 10xxxxxx` (11 bits), `1110xxxx 10xxxxxx 10xxxxxx` (16 bits), `11110xxx` plus three `10xxxxxx` (21 bits). Write the code point in binary, pad it on the left, and fill the x's from the right. To decode, the first byte's leading 1s give the length; strip the prefixes and join the rest. UTF-16 uses 2 bytes up to U+FFFF and 4 above.

## Compression and storage

1. Ratio = original ÷ compressed. Saving % = (original − compressed) ÷ original × 100.
2. Run-length encoding: split into runs of the same character and write count + character for each run.
3. Decoding: repeat each character by the count in front of it.
4. To see how many files fit, put both sizes in the same unit, divide and round down.

Example: `WWWBBW` → `3W2B1W`.

**Watch out:** a run of 1 still needs its count, so RLE can make text longer.

**Expert: Huffman and trade-offs.** Huffman: keep joining the two smallest counts; the total bits equal the sum of all the joined counts. A fixed-length code uses the fewest bits b with 2^b ≥ number of characters. Compressing before sending pays off only if the link time saved is more than the compression time. When a count byte holds at most 255, a run of 256 needs two pairs.
