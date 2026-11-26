## General

Frontend scenarios chain simple steps, so work in order and keep the units straight (px, rem, KB, MB, Mbps, ms, fps).

1. Read the stated rules first: the pixels in one rem, the byte and bit sizes, the frame budget, the contrast rule.
2. Write down which number each part asks for, and its rounding.
3. Whole things (cards, rows, items) round **down** when asking how many fit, and **up** when asking how many are needed.
4. For a yes or no, find the numbers first, then compare them using the stated rule. Equal to the limit counts as meeting it.

## Responsive layout maths

Container = share % × window width. Card width in px = rem × pixels per rem. A row of n cards needs n × card + (n − 1) × gap, so n = round down of (container + gap) ÷ (card + gap). Rows needed = cards ÷ per row, rounded up.

For a grid of k columns and gutters g: column = (width − (k − 1) × g) ÷ k. A panel over s columns = s × column + (s − 1) × g. Pixels ÷ pixels per rem = rem. An image fits if the panel is at least as wide.

## Page weight and load time

Page weight = number of images × size + scripts (and any other files). Compression of c% leaves (100 − c)% of the images. 1 KB = 1000 bytes = 8000 bits, and M Mbps = M × 1,000,000 bits a second, so time (s) = KB × 8000 ÷ (M × 1,000,000).

A repeat visit downloads only what the cache does not hold (here the HTML and the images). Within the limit means the time is at or under it.

## Frame budget and long lists

Budget (ms) = 1000 ÷ fps. Items per frame = round down of (budget − fixed cost) ÷ cost per item. Frame time = fixed + items × cost. Frame rate = 1000 ÷ frame time in ms.

A virtualised list draws the rows in view (window height ÷ row height, rounded up, since a cut-off row is still drawn) plus the spare rows on both sides. Scroll height = rows × row height. A speed-up is the slow frame time ÷ the fast frame time.

## Colour contrast

Ratio = (lighter luminance + 0.05) ÷ (darker luminance + 0.05). Decide which colour is lighter first; text is not always the darker one. At 4.5 : 1 or more it passes.

To find the darkest text allowed on a light background: darker luminance = (lighter + 0.05) ÷ 4.5 − 0.05. Every shade below that passes. A button passes only if every state passes.

A dark overlay leaves (1 − opacity) of the photo's luminance. For the least opacity, find the highest photo luminance that still passes, then the share that must be removed, rounded up.
