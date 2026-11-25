# Pixels & Colour

Every frame a game draws is a grid of pixels, and every pixel is three numbers: red, green and blue, each from 0 to 255. Here you work with those numbers the way artists and engine programmers do: reading hex colours, mixing see-through sprites over a background, fitting a game onto different screens, and packing animations into sprite sheets.

| Subtopic | What you do |
| --- | --- |
| Hex and RGB | Convert between hex bytes like `3F` and decimal, read and write `#RRGGBB` colours, invert and greyscale them |
| Alpha blending | Mix a sprite over a background with `result = a × src + (1 − a) × dst`, per channel |
| Resolution and aspect | Count pixels, simplify aspect ratios, scale a game up to fit a screen, work out black bars |
| Sprite sheets and textures | Count frames, find a frame's column, row and pixel position, and work out texture memory |

**Answer formats**

- **Hex bytes:** two digits, like `0F` or `A7`. Capital or small letters both count.
- **Hex colours:** type the `#`, like `#1A2B3C`.
- **Several channels:** red, green, blue in that order with commas, like `12, 200, 7`.
- **Aspect ratios:** simplest form, like `16:9`.
- **Whole numbers** for pixels, frames and bytes; blends round to the nearest whole number (halves round up). MiB and megapixel answers round to 2 decimal places, and each question says which unit it means (1 MiB = 1,048,576 bytes; 1 megapixel = 1,000,000 pixels).

Sprite frames, columns and rows always count from 0, left to right and then top to bottom. Colours are shown as text, not swatches.
