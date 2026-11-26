# Time and Dates: how to solve

## General

- Time is base 60: 60 minutes make an hour, so carry and borrow 60, not 100.
- Do the hours first, then the minutes. If the minutes pass 59, carry 1 hour; if they go below 0, borrow 1 hour.
- When a time passes midnight, go to 24:00 (00:00) first, then carry on into the next day.
- Type 24-hour times as `hh:mm`, and 12-hour times with am or pm.

## Clock time

1. To 24-hour time: am hours stay (12 am becomes 00); pm hours add 12 (12 pm stays 12).
2. To 12-hour time: hours 13–23 take away 12 and are pm; 00 becomes 12 am; 12 is 12 pm.
3. Adding a duration: add the hours, then the minutes, and carry.
4. How long between two times: count up to the next whole hour, then whole hours, then the last minutes.
5. Working backwards (latest time to get up): add every step, then subtract the total from the deadline.

Example: 09:40 + 2 h 35 min. Hours: 11:40. Minutes: 40 + 35 = 75 = 1 h 15 min, so **12:15**.

**Watch out:** pay is hours × rate with the hours as a decimal: 7 h 30 min is 7.5 h, not 7.3.

## Calendar dates

1. Know the month lengths: 30 days for April, June, September and November; 31 for the rest; February 28, or 29 in a leap year.
2. Leap years divide by 4. Century years (1900, 2100) are not leap years unless they divide by 400 (2000 is).
3. Days after a date: count to the end of the month first, then take away whole months one at a time.
4. Days between two dates: days left in the first month, plus the full months in between, plus the day number of the last date.
5. "Including both days" adds 1 to the count.
6. Weekdays repeat every 7 days, so only the remainder after dividing by 7 matters.

Example: 20 days after 25 March: 6 days reach 31 March, and 14 more give **14 April**.

**Watch out:** the 5th time something happens every 10 days is 4 gaps after the first, so 40 days later, not 50.

## Time zones

1. Find the gap between the two UTC offsets. A bigger offset is further east, so its clock is ahead.
2. Going to a zone that is ahead, add the gap; going to one that is behind, subtract it.
3. If the time goes past 24:00, it is the next day; below 00:00, the previous day.
4. For a flight, add the flight time in the departure zone first, then convert to the arrival zone.
5. For a flight time from two local times, convert both to one zone, then subtract.

Example: 22:00 in London (UTC+0) is 22:00 + 9 h = 07:00 **the next day** in Tokyo (UTC+9).

**Watch out:** offsets such as UTC+5:30 and UTC+5:45 change the minutes, not only the hours.
