# Computing Terms: how to solve

## General
- Many terms are acronyms: expand them word by word (RAM = Random Access Memory).
- Ask what job the thing does: process, store, connect or protect.
- Typed answers ignore capital letters, but spelling counts. For numbers, type digits only, e.g. `1000`, not `1,000`.

## Hardware
1. Sort the part by role: **CPU** runs instructions, **GPU** does many simple sums in parallel (graphics), **motherboard** connects everything.
2. Memory: **RAM** is fast working memory and **volatile** (lost at power-off); **ROM** is read-only and keeps its data.
3. **Cache** is a tiny, very fast memory right next to the CPU for often-used data.
4. Storage: an HDD has spinning disks; an **SSD** uses flash chips with no moving parts.
5. Devices: input sends data *in* (keyboard, mouse, microphone); output shows it *out* (monitor, speaker, printer).

Watch out: clock speed is measured in hertz (GHz today), not bytes.

## Networks
1. Size of network: **LAN** = local (a home or office), **WAN** = wide (a country or the world).
2. Match the device or protocol to its job (see the table below).
3. Address sizes: IPv4 is 32 bits (four numbers 0–255), IPv6 is 128 bits.
4. Private IPv4 ranges start with `10.`, `172.16–31.` or `192.168.`.

| Thing | Job |
| --- | --- |
| router | forwards data between networks |
| DNS | turns names like example.com into IP addresses |
| DHCP | hands a joining device its IP address |
| HTTP / HTTPS | web pages; the S means **secure** (encrypted) |

Watch out: HTTP's default port is 80, HTTPS's is 443.

## Units of data
1. A **bit** is 0 or 1; **8 bits = 1 byte**.
2. n bits give 2ⁿ values, so one byte holds 2⁸ = 256 values.
3. SI prefixes go up in **1000s**: KB, MB, GB, TB. Binary prefixes go up in **1024s**: KiB, MiB, GiB.
4. A GiB is slightly bigger than a GB, so a drive "loses" about 7% when shown in GiB.
5. Speeds are in **bits** per second: divide by 8 to get bytes.

Example: 40 Mbps ÷ 8 = 5 MB each second.

Watch out: a lower-case **b** means bits, an upper-case **B** means bytes.

## Security
1. Name the attack from what it does (see the list below).
2. Defences: a firewall filters traffic by rules; encryption scrambles data so only a key holder can read it.
3. **2FA** = something you know (password) + something you have (phone or app code).
4. Public-key encryption: share the **public** key; keep the private key secret.
5. Strong passwords are long, random and mix several kinds of character.

- Tricks you into giving details → **phishing**
- Locks your files for a fee → **ransomware**
- Tries every password → **brute force**
- Floods a server from many machines → **DDoS**

Watch out: the padlock or `https://` means the connection is encrypted, not that the site is honest.
