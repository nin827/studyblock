## General

Network scenarios mix counting, binary and unit conversion. Read the stated conventions first, then work in order, because each part usually feeds the next.

1. Note the rounding each part asks for. A rounded earlier answer gives the same later answer.
2. Keep units consistent: MB or megabits, seconds or minutes, per minute or per window.
3. For a Yes/No part, find the number first, then compare it with the stated rule. Check whether the rule says "more than" or "at least".

## Subnet planning

Host bits = 32 − prefix length. A subnet holds 2^(host bits) addresses, and two are reserved, so usable hosts = 2^(host bits) − 2.

The block size is 2^(host bits) counted in the octet where the mask stops. The network address is the host address rounded down to a multiple of the block size, and the broadcast address is the network address plus block size − 1.

To size a subnet, add growth to the device count and round up. Then find the smallest number of host bits whose 2^h − 2 is large enough. Each extra prefix bit halves the subnet and doubles the number of subnets in a block.

## Transfer windows

1 MB = 8 megabits and 1 GB = 1000 MB. Overhead adds a percentage on top of the data: multiply by (100 + overhead) ÷ 100.

Time in seconds = megabits ÷ link speed (Mbps). Divide by 60 for minutes.

Working backwards, capacity = speed × seconds ÷ 8 gives MB. Divide by the overhead factor to get file data, and round files down. The speed needed is the total megabits ÷ seconds, then the next standard link up.

## Ciphers and keys

Number the letters A = 0 to Z = 25 and reduce mod 26. A Caesar shift is (cipher − plain) mod 26, and decoding goes back by the shift.

An affine cipher is E(x) = (a·x + b) mod 26. To decrypt, find t with a·t ≡ 1 (mod 26) and use D(y) = t·(y − b) mod 26.

From two known pairs, subtract the equations: a·(x1 − x2) ≡ (y1 − y2) mod 26. Solve for a, then substitute to find b. The key space is 12 values of a times 26 values of b = 312 keys.

## Logs and flags

Rate = count ÷ minutes. A mean is the total divided by the number of buckets. A share is part ÷ total × 100.

For a flag byte, turn each hex digit into four bits and read bit 0 from the right. The risk score is the sum of the weights of the set bits. A rule that changes a limit based on the score is applied first, and then the observed count is compared with the limit times the window.
