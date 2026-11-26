# Algorithms

An algorithm is a precise recipe a computer follows. Here you trace classic algorithms **by hand**, step by step, the way you would on paper. There's no calculator: following each step yourself is the point.

## What you'll practise

- **Searching:** linear search and binary search. How many comparisons, and which item gets checked when.
- **Sorting:** bubble, insertion and selection sort. What the list looks like after a given pass, and how many swaps happen.
- **Complexity:** Big-O. Name the growth rate of an algorithm or a loop, count how often a statement runs, and predict how the running time changes when n grows.
- **Stacks and queues:** run a sequence of push/pop or enqueue/dequeue operations and say what comes out and what's left.

## How to answer

- Lists are written like `[4, 9, 2, 7]`. **Indexes start at 0**, so 4 is at index 0 and 7 at index 3.
- When the answer is a whole list, you usually pick it from the options. For what a stack or queue holds at the end, you build the list from blocks instead: one block per value added, and the removed ones are left over.
- Counts, values and indexes are typed as whole numbers.
- Each question spells out the exact version of the algorithm it uses, and the **How to solve** card in Guided mode has the same rules.

## Expert

Expert questions make you reason about a whole algorithm, not just trace one run, and most have several parts:
- **Searching:** how many comparisons each item needs, or which target produced a given trace.
- **Sorting:** work backwards to the starting list, total swaps and shifts, and merging two sorted lists.
- **Complexity:** scale a running time up, find the largest input that fits a time budget (round down), and find where a slower-growing algorithm starts to win.
- **Stacks and queues:** impossible stack orders, circular-buffer queues and bracket checking.
