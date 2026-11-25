# Networking

Practise the arithmetic behind IPv4 networks: reading addresses in binary, working with subnet masks, finding the network and broadcast addresses of a subnet, and timing data transfers.

## Answer formats

| You're asked for | Type it like |
| --- | --- |
| An address or mask | `192.168.1.0`: dotted decimal, no leading zeros, no spaces |
| One octet in binary | `00101101`: all 8 bits, leading zeros included |
| A whole address in binary | `11000000.10101000.00000001.00000000` |
| A prefix length | just the number: `26` for /26 |
| A count or a time | a number; each question says how to round |

## Key facts

- An IPv4 address is 32 bits, written as four 8-bit **octets**. The place values in an octet are 128, 64, 32, 16, 8, 4, 2, 1.
- **/n** means the first *n* bits are the network part. A /n subnet has 2^(32 − n) addresses, and **2^(32 − n) − 2 usable hosts** (the network and broadcast addresses can't be used). Questions use /1 to /30 only.
- **Private ranges (RFC 1918):** `10.0.0.0/8`, `172.16.0.0/12` (172.16 to 172.31) and `192.168.0.0/16`. **Loopback** is `127.0.0.0/8`, and **link-local** (APIPA) is `169.254.0.0/16`.
- **Data sizes vs speeds:** sizes are in bytes, link speeds in bits per second, and 1 byte = 8 bits. Every question says whether its prefixes mean 1000 (KB, MB, GB, kbps, Mbps, Gbps) or 1024 (KiB, MiB, GiB).

| Level | What to expect |
| --- | --- |
| Easy | Single octets and address classes, common prefixes (/8, /16, /24 to /30), subnets on /8, /16 and /24, whole-number transfer times |
| Medium | Whole addresses in binary, private or public, any prefix from /9 to /30, counting subnets, mixed units rounded to 2 decimal places |
| Hard | Addresses near range boundaries, prefixes from /1 to /30, wildcard masks, borrowing bits, 1024-based sizes and overhead, questions with several parts |
