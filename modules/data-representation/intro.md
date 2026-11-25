# Data Representation

Everything a computer stores is bits. Here you work out how many: pixels and colour depth for images, samples for sound, codes for text, and how compression and storage space change the picture.

## Answer formats

| You're asked for | Type it like |
| --- | --- |
| A size, count or time | a number; each question says how to round |
| A binary byte | all 8 bits, like `01000001` |
| A word or encoded text | the letters, like `HELLO` or `3A2B1C` |
| A percentage | the number without the `%` sign |

## Key facts

- **Units:** 1 byte = 8 bits. Every question says whether its prefixes mean 1000 (KB, MB, GB) or 1024 (KiB, MiB, GiB), like the Networking subject.
- **Images:** size in bits = width × height × colour depth. n bits per pixel give 2^n colours.
- **Sound:** size in bits = sample rate × bit depth × channels × seconds. Mono is 1 channel, stereo is 2.
- **Characters:** ASCII gives each character a code (questions tell you a starting code like `A` = 65). Unicode gives every character a code point such as U+00E9, and UTF-8 stores it in 1 to 4 bytes.
- **Compression:** ratio = original size ÷ compressed size. Run-length encoding writes each run as count + character, like `AAAB` → `3A1B`.
- Files here are uncompressed with no header, unless a question says otherwise.

| Level | What to expect |
| --- | --- |
| Easy | Colours from bits, small images and clips in bytes, ASCII codes, simple run-length encoding |
| Medium | Sizes in KB, MiB and so on, bit rates, binary codes, percentage savings |
| Hard | Working backwards, how many files fit, UTF-8 byte counts, questions with several parts |
| Expert | Indexed (palette) images, video, image sizes from an aspect ratio; sample rates and the Nyquist limit, recording time on a card; encoding and decoding UTF-8 bytes, UTF-8 vs UTF-16; Huffman coding, compress-or-send decisions, run-length encoding with a 255 limit |

In Expert, single bytes are typed as 2 hex digits, like `C3`.
