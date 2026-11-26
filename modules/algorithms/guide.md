# Algorithms: how to solve

## General

- Trace on paper: write the list (or the stack or queue) down again after every step. Most mistakes come from doing two steps in your head at once.
- Indexes start at 0. In `[4, 9, 2, 7]`, index 0 holds 4 and index 3 holds 7.
- Every list holds different numbers, so "the smallest" or "the item equal to the target" is always just one item.
- Whole-list answers are multiple choice. Counts, values and indexes are whole numbers.

## Searching

1. **Linear search:** compare the target with index 0, then 1, then 2, and so on. Each item compared is one comparison, including the one that matches.
2. Found at index i means i + 1 comparisons. Not in the list means every item is compared, so n comparisons.
3. **Binary search** (sorted list only): start with lo = 0 and hi = the last index.
4. Each step, work out mid = floor((lo + hi) / 2) and compare the target with the item at mid. That is one comparison.
5. If they're equal, stop. If the target is smaller, set hi = mid - 1. If it's bigger, set lo = mid + 1.
6. If lo becomes bigger than hi, the target isn't in the list. That final check costs no comparison.
7. The most comparisons binary search can ever need for n items is floor(log2 n) + 1.

Example: find 31 in `[5, 12, 18, 23, 31, 40, 47]`. Step 1: mid = floor((0 + 6) / 2) = 3, which holds 23; 31 is bigger, so lo = 4. Step 2: mid = floor((4 + 6) / 2) = 5, which holds 40; 31 is smaller, so hi = 4. Step 3: mid = 4, which holds 31. Found in **3** comparisons.

**Watch out:** mid rounds **down**, and the new range leaves out mid itself (mid - 1 or mid + 1).

**Expert: binary search as a tree.** The first middle item is found in 1 comparison, the middles of the two halves in 2, then 4 items in 3, and so on; the last level holds the leftovers. To work backwards from a trace, each next value compared tells you whether the target was smaller (it moved left) or bigger (it moved right).

## Sorting

1. **Bubble sort** (ascending): each pass goes left to right, comparing neighbours. Swap them when the left one is bigger. Pass 1 checks every pair; each later pass stops one place earlier, because the biggest items are already at the end.
2. **Insertion sort:** pass 1 takes the item at index 1 and slides it left past every bigger item. Pass 2 does the same with the item at index 2, and so on. After pass k, the first k + 1 items are in order and the rest haven't moved.
3. **Selection sort:** pass 1 finds the smallest item and swaps it into index 0. Pass 2 finds the smallest of the rest and swaps it into index 1, and so on. There's no swap if the smallest is already in place.
4. Write the whole list down after each pass, and use that list for the next pass.
5. Total bubble-sort swaps = the number of pairs that start in the wrong order (a bigger item before a smaller one).

Example: bubble sort, pass 1 on `[7, 3, 9, 2]`: 7 > 3, swap → `[3, 7, 9, 2]`; 7 < 9, no swap; 9 > 2, swap → `[3, 7, 2, 9]`. That is 2 swaps.

**Watch out:** in bubble sort a swapped item keeps moving, so compare it again with its new right-hand neighbour.

**Expert: working backwards and totals.** To find a starting list, run the given number of passes on each option. Insertion sort's total shifts equal the number of pairs where a bigger item comes before a smaller one. Selection sort skips the swap when the smallest item is already in place. Merging two sorted lists costs one comparison per item moved until one list is empty; the rest is copied free.

## Complexity

1. Ask how the work grows as n grows. Drop constant factors and smaller terms: 2n is O(n), and n²/2 is O(n²).
2. A loop from 1 to n is O(n). Two such loops one after the other are still O(n). One nested inside the other is O(n²), and three nested is O(n³).
3. A loop whose counter doubles or halves each time is O(log n). Inside a loop over n, it gives O(n log n).
4. A loop with a fixed limit, such as 1 to 50, is O(1), because it doesn't depend on n.
5. To count the runs for a given n, count each loop's values and multiply the counts for nested loops.
6. Scaling: if n is multiplied by m, an O(n) time is multiplied by m, O(n²) by m², and O(n³) by m³. An O(1) time doesn't change.
7. For log2 n and n log2 n, use the powers of 2 given in the question.

Example: an O(n²) algorithm takes 3 s at n = 1000. At n = 3000, n is 3 times bigger, so the time is 3² = 9 times longer: 27 s.

**Watch out:** an inner loop that runs from 1 to i, not 1 to n, still makes the whole thing O(n²).

**Expert: budgets and crossovers.** With O(n²), n times k means time times k²; with 2^n, n + 1 doubles the time. For the largest n in a budget, undo the power, round **down**, and check n + 1 goes over. For "when is A faster", solve the inequality and remember that equal is not faster.

## Stacks and queues

1. A **stack** is last in, first out. Push adds to the top, and pop removes the top item (the newest).
2. A **queue** is first in, first out. Enqueue adds at the back, and dequeue removes the front item (the oldest).
3. Write the contents after every operation: a stack from bottom to top, and a queue from front to back.
4. Note the value each pop or dequeue returns as you go.

Example: on an empty stack, `push 4`, `push 9`, `pop`, `push 2` → the pop returns 9, and the stack ends as `[4, 2]` with 2 on top.

**Watch out:** with the same operations, a queue would return 4, not 9. Check which structure the question uses.

**Expert: stack orders, circular buffers, brackets.** If 1, 2, 3, … are pushed in order, a pop order is impossible when a number is needed while a smaller one sits on top of it. In a circular buffer, front moves once per dequeue and rear once per enqueue, wrapping from the last slot to 0 (count modulo the size). A bracket checker pushes openers and fails at the first closer that doesn't match the top.

## Write the trace

1. Type numbers in order, separated by commas: `27, 16, 9`. Spaces don't matter, and `[27, 16, 9]` also counts.
2. **Binary search:** write down the value at every mid you look at, including the target if it is found. Stop when it is found or lo > hi.
3. **Sort passes:** do the passes one by one on paper, exactly as in Sorting above, and type the whole list after the asked pass.
4. **Stacks and queues:** write the structure after each operation. "Which values come out" lists the removed items in the order they leave; "what it holds" lists what is left, bottom to top (stack) or front to back (queue).
5. **Merge sort levels (Expert):** level 1 sorts each neighbouring pair; level 2 merges pairs into sorted groups of four. Items never leave their group, so sort each group of four and write the groups one after another.

Example: binary search for 3 in `[3, 10, 16, 21, 29, 32, 38, 40]` looks at index 3 (21), then index 1 (10), then index 0 (3): type `21, 10, 3`.

**Watch out:** in Blocks mode some number blocks are decoys. A list item that binary search never looks at, or a value that was removed, doesn't belong in the answer.
