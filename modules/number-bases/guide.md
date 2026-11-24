# How to solve: Number Bases

## General

- Every place is worth the base times the place to its right: binary goes 1, 2, 4, 8, 16, …; hex goes 1, 16, 256, 4096.
- Hex letters stand for 10–15: A = 10, B = 11, C = 12, D = 13, E = 14, F = 15.
- The calculator is off here, so jot your working down on paper.
- Answer formats: binary and hex without leading zeros (and no `0b` or `0x`), decimal as a plain whole number, two's complement as exactly 8 bits.

## Binary and decimal

1. **Binary to decimal:** write the place values 1, 2, 4, 8, … under the bits, starting from the right.
2. Add up only the place values that sit under a 1.
3. **Decimal to binary:** divide by 2 again and again and write down each remainder (0 or 1), until you reach 0.
4. Read the remainders from the last one back up to the first.

Example: `1101` = 8 + 4 + 1 = 13.

**Watch out:** reading the remainders top to bottom gives the bits backwards.

## Hexadecimal

1. **Hex to decimal:** multiply each digit by its place value (1, 16, 256, 4096 from the right) and add. Turn letters into 10–15 first.
2. **Decimal to hex:** divide by 16 again and again; each remainder (0–15) is one hex digit. Read them from the bottom up.
3. **Hex to binary:** turn each hex digit into exactly 4 bits (8-4-2-1), join them, and drop leading zeros.
4. **Binary to hex:** split the bits into groups of 4 from the right, pad the left group with zeros, and convert each group.

Example: `2F` = 2 × 16 + 15 = 47, and `2F` = `0010 1111` = `101111` in binary.

**Watch out:** group binary digits from the **right**, not the left.

## Binary arithmetic

1. **Adding:** line the numbers up on the right and add column by column from the right.
2. Use 0 + 1 = 1, 1 + 1 = 10 (write 0, carry 1) and 1 + 1 + 1 = 11 (write 1, carry 1). A carry left at the end becomes a new leftmost 1.
3. **Negating in two's complement:** invert every bit, then add 1. Keep all 8 bits.
4. **Reading a two's complement pattern** that starts with 1: the leftmost bit is worth −128, so the value is −128 plus the other seven place values.

Example: `11111011` = −128 + 64 + 32 + 16 + 8 + 2 + 1 = −5.

**Watch out:** inverting the bits is only half the job. You still need to add 1.
