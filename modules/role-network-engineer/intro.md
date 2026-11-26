# Applied scenarios (Network Engineer)

Expert+ questions for the **Network Engineer** role. Each one is a single scenario with several linked answers, and each answer uses a different skill: subnetting, binary, unit conversion, ciphers, counting or a rule check. A later part often builds on an earlier one, so work in order. The calculator is on, and the numbers from the prompt are already in it where that helps.

Every part says how to round. Conventions are the same as in Networking: usable hosts are 2^(host bits) − 2, the network and broadcast addresses are reserved, /31 and /32 are not used, 1 MB = 8 megabits and 1 GB = 1000 MB. Letters are numbered A = 0 to Z = 25.

## Subnet planning

An interface address and prefix length give the subnet's size, network address, broadcast address and mask, and you decide whether a second device is on the same subnet. At Expert+ you size a subnet from a device count and growth, then check that a parent block can be split into enough of them.

## Transfer windows

A file or backup crosses a link with protocol overhead. Convert units, find the time and decide whether it fits a window. At Expert+ you work backwards from the window to the data that fits, the number of files and the link you need.

## Ciphers and keys

Caesar shifts are recovered from a known letter and used to decode messages. At Expert you encrypt and decrypt with an affine cipher by hand, using the inverse of the key. At Expert+ two known letter pairs reveal the key, and you judge whether the key space is big enough.

## Logs and flags

Failed-login counts become rates, totals and shares, and a rule decides whether to lock or alert. At Expert+ a flag byte in hex becomes bits and a risk score, which changes the lockout limit.
