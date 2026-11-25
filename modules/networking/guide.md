# Networking: how to solve

## General

- An IPv4 address is four octets of 8 bits. The place values in each octet are 128, 64, 32, 16, 8, 4, 2, 1.
- /n means n network bits on the left and 32 − n host bits on the right.
- Type addresses in dotted decimal with no leading zeros, like `192.168.1.0`.
- Sizes are in bytes and speeds in bits per second. Multiply bytes by 8 before you divide.

## IP addresses and binary

1. Decimal to binary: go through 128, 64, 32, 16, 8, 4, 2, 1. Write 1 and subtract when the value fits, otherwise write 0.
2. Binary to decimal: add the place values under each 1.
3. For a whole address, do each octet on its own and join them with dots.
4. To classify an address, compare it with the private, loopback and link-local ranges below. Anything else is public.

Example: 172 = 128 + 32 + 8 + 4, so it is `10101100`.

**Watch out:** `172.16.0.0/12` stops at 172.31, so `172.32.0.1` is public.

**Expert: an address as one number.** The octets are base-256 digits: first × 16,777,216 + second × 65,536 + third × 256 + fourth. In hex each octet is two digits, so 10.0.0.1 is `0A000001`. To find a network, AND the address with the mask bit by bit: a bit stays 1 only where both are 1. Two hosts share a subnet when their network addresses match.

| Range | Type |
| --- | --- |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | Private (RFC 1918) |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local (APIPA) |

## Subnet masks and CIDR

1. Write n ones followed by 32 − n zeros, in groups of 8.
2. Each full group is 255. A part group with k ones is the sum of the top k place values (128, 192, 224, 240, 248, 252, 254).
3. Usable hosts = 2^(32 − n) − 2.
4. Borrowing s bits makes 2^s subnets (all usable here), and the new prefix is n + s.

Example: /27 = 8 + 8 + 8 + 3, so the mask is `255.255.255.224` and it has 2^5 − 2 = 30 usable hosts.

**Watch out:** don't forget the − 2 for hosts. Subnet counts have no − 2.

**Expert: VLSM and summaries.** For each team find the smallest block (2^h with 2^h − 2 ≥ hosts), sort the blocks biggest first, and place them one after another from the start. A summary route keeps only the leading bits that every network shares. Working back from a broadcast: hosts + 2 = 2^h gives the prefix 32 − h, and the network address is broadcast − 2^h + 1.

## Network and broadcast

1. Find the octet where the mask stops being 255. Block size = 256 − that mask octet.
2. Network: in that octet, take the largest multiple of the block size that is ≤ the address. Set later octets to 0.
3. Broadcast: next multiple − 1 in that octet, and 255 in every later octet.
4. First usable host = network + 1. Last usable host = broadcast − 1.

Example: `10.1.1.77/26` has block size 64, so the network is `10.1.1.64` and the broadcast is `10.1.1.127`.

**Watch out:** octets before the interesting one never change.

**Expert: numbered subnets and gateways.** Subnet k (counting from 0) starts k × size addresses after the base; carry into the next octet every 256. A gateway must lie strictly between the network and broadcast addresses of the host's own subnet. Given an address and its broadcast, the host bits are the trailing 1s of the broadcast that make the address a usable host in that block.

## Data transfer

1. Convert the size to bits: size × prefix (1000s or 1024s, as the question says) × 8.
2. Convert the speed to bits per second: speed × 1000s. Multiply by the useful share if there's overhead.
3. Time = bits ÷ bits per second. Throughput = bits ÷ seconds.
4. Change seconds to minutes (÷ 60) only if asked, then round at the end.

Example: 100 MB over 50 Mbps is 100 × 8 = 800 Mb, and 800 ÷ 50 = 16 s.

**Watch out:** MiB and GiB use 1024, but link speeds always use 1000.

**Expert: planning transfers.** Needed link speed = bits ÷ seconds ÷ efficiency; then pick the slowest plan that is not below it. Store-and-forward links take turns, so their times add up. A courier's speed is all the bits ÷ the trip time in seconds.
