# Number Bases

Computers store everything as **binary**: base 2, using only the digits 0 and 1. Programmers often write binary in **hexadecimal** (base 16) because it is shorter. Here you practise converting between bases and doing sums in binary.

The calculator is switched off for this module, because it only works in decimal.

## How to write your answers

- **Binary:** digits only, no leading zeros, e.g. `1011`, not `01011` or `0b1011`.
- **Hexadecimal:** digits 0–9 and A–F, no `0x` and no leading zeros, e.g. `2F`. Lowercase is fine too, so `2f` also counts.
- **Decimal:** a plain whole number, e.g. `47`.
- **Two's complement:** exactly 8 bits, keeping leading zeros, e.g. `00010110`.

## Place values

| Base | Place values (right to left) |
| --- | --- |
| Binary | 1, 2, 4, 8, 16, 32, 64, 128, … |
| Hexadecimal | 1, 16, 256, 4096, … |

Hex digits A–F stand for 10–15. One hex digit is exactly 4 bits, so `2F` is `0010 1111`, which is `101111` without the leading zeros.

**To convert to decimal**, multiply each digit by its place value and add. **To convert from decimal**, divide by the base again and again, then read the remainders from bottom to top.

## Binary arithmetic

Add column by column from the right: 0 + 0 = 0, 0 + 1 = 1, and 1 + 1 = 10, so you write 0 and carry 1.

**Two's complement** is how computers store negative whole numbers. In 8 bits, the leftmost bit is worth −128 instead of +128.
- To **negate** a pattern (turn +x into −x or back), invert every bit, then add 1. For example, `00000101` (5) becomes `11111010` + 1 = `11111011` (−5).
- To **read** a pattern whose leftmost bit is 1, start from −128 and add the other place values. For example, `11111011` = −128 + 123 = −5.

| Level | Binary | Hexadecimal | Arithmetic |
| --- | --- | --- | --- |
| Easy | up to 4 bits | 1–2 hex digits | add two numbers of up to 4 bits |
| Medium | up to 8 bits | 3 hex digits | add two 8-bit numbers |
| Hard | up to 12 bits | 4 hex digits | 8-bit two's complement |
| Expert | bitwise AND/OR/XOR, binary fractions, counters that wrap | hex sums and differences, colour codes, memory addresses | signed addition with overflow, subtraction by adding the negative |

**Expert** questions have several parts. Binary fractions are written like `110.101`, with no zeros at the end after the point.
