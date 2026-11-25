# Pixels & Colour: how to solve

## General

- A colour is three channels, red, green and blue, each 0 to 255. Work on each channel on its own.
- Hex is base 16. The digits A to F mean 10 to 15, and a byte is two digits: first digit × 16 + second digit.
- Count frames, columns and rows from 0, left to right and then row by row.
- Keep full precision and round only at the end, the way the question says.

## Hex and RGB

1. To read a hex byte, work out first digit × 16 + second digit.
2. To write a decimal value in hex, divide by 16. The quotient is the first digit and the remainder the second.
3. In `#RRGGBB` the pairs are red, green and blue, in that order. Shorthand `#RGB` doubles each digit.
4. To invert, use 255 − value on each channel. To grey by the average, add the channels and divide by 3.

Example: `3F` = 16 × 3 + 15 = 63, and 200 = 12 × 16 + 8, which is `C8`.

**Watch out:** a byte always has two digits, so 15 is `0F`, not `F`.

## Alpha blending

1. Write the opacity a as a decimal. An alpha byte A means a = A ÷ 255.
2. Use result = a × src + (1 − a) × dst on each channel.
3. With two layers, blend the lower one first, then blend the top one over that result.
4. Round to a whole number only at the end.

Example: 200 at opacity 0.25 over 40 gives 0.25 × 200 + 0.75 × 40 = 50 + 30 = 80.

**Watch out:** the opacity belongs to the sprite (src). Don't swap a and 1 − a.

## Resolution and aspect

1. Total pixels = width × height.
2. For an aspect ratio, divide the width and height by their greatest common factor.
3. To fit a picture on a screen, the scale is the smaller of screen width ÷ width and screen height ÷ height. For pixel art, round it down to a whole number.
4. The black bars share the leftover space equally: (screen size − scaled size) ÷ 2.

Example: 1920 × 1080 ÷ 120 gives 16:9, and 320 × 180 on 1920 × 1080 scales by 6.

**Watch out:** use the smaller scale. The larger one makes the picture spill off the screen.

## Sprite sheets and textures

1. Frames across = sheet width ÷ frame width. Frames down = sheet height ÷ frame height.
2. For frame i in a sheet C columns wide, the column is i mod C and the row is i ÷ C, rounded down.
3. Pixel position = column × frame width (plus margin and spacing if there are any).
4. Texture bytes = width × height × bytes per pixel. Divide by 1,048,576 for MiB. A full mipmap chain adds every half-size level down to 1 × 1.

Example: frame 13 in a sheet 5 columns wide is 13 ÷ 5 = 2 remainder 3, so column 3, row 2.

**Watch out:** frames count from 0, so frame 5 in a 5-column sheet starts the second row.
