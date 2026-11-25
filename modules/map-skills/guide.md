# Map Skills: how to solve

## General

1. Read the conventions in the question: the scale, how the grid is labelled, or the UTC offsets.
2. Put everything into matching units before you calculate.
3. Sketch it if it helps: a line for a distance, an arrow from north for a bearing.
4. Check the answer makes sense: a short map line is a short walk, and east of you is ahead in time.

Example: 4 cm on a 1 : 50 000 map is `4 × 50000 = 200000` cm = 2 km.

**Watch out:** 1 km = 100 000 cm, not 1000 cm.

## Scale & distance

1. Map to ground: multiply the map distance by n (from 1 : n) to get centimetres on the ground.
2. Change units: ÷ 100 for metres, ÷ 100 000 for km. Ground to map: do the reverse.
3. Time = distance ÷ speed; × 60 for minutes.
4. Gradient 1 : n: n = horizontal distance ÷ height difference, both in metres. Areas scale by (km per cm)².

Example: 6 cm on 1 : 25 000 is `6 × 25000 / 100 = 1500` m.

**Watch out:** in an area question, square the scale factor; don't just multiply by it once.

## Grid references

1. Find the feature's column: its label (the easting line on the west edge) gives the first two digits.
2. Find its row: its label (the northing line on the south edge) gives the next two digits.
3. For 6 figures, put the tenths east after the easting and the tenths north after the northing.
4. Each unit of a 6-figure reference's third digit is 100 m; use Pythagoras for straight-line distances.

Example: column 34, row 17, 3 tenths east and 6 tenths north gives `343176`.

**Watch out:** easting first ("along the corridor, then up the stairs"), and use the lines to the west and south of the feature, not the east or north.

## Bearings

1. Start facing north (000°) and turn clockwise: east 090°, south 180°, west 270°.
2. A back bearing is 180° round: add 180 if the bearing is under 180, otherwise subtract 180.
3. A turn to the right adds; a turn to the left subtracts. Keep the result between 0 and 359.
4. From east and north movements: find θ with tan θ = east ÷ north, then fix the quadrant.

Example: the back bearing of 070° is `070 + 180 = 250°`.

**Watch out:** a movement south-west needs 180 + θ, not just θ; sketch the quadrant first.

## Time zones

1. Change the start time to UTC: take away the start place's offset.
2. Add or take away any flight time.
3. Change to the destination: add its offset.
4. Passing midnight forwards is the next day; going below 00:00 is the day before.

Example: 15:00 in Tokyo (UTC+9) is 06:00 UTC, which is 01:00 in New York (UTC−5).

**Watch out:** with a negative offset like UTC−5, "adding the offset" means subtracting 5 hours.
