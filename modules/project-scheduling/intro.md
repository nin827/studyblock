# Project Scheduling

How long a project takes and what it costs: reading an activity network, finding the critical path and float, turning working days into dates, and tracking progress with earned value.

| Topic | Key ideas |
| --- | --- |
| Critical path | the longest route through the network sets the project duration |
| Float and crashing | total float = LS − ES; paying to shorten activities |
| Working-day dates | start date is day 1, weekends and listed holidays are skipped |
| Earned value | CV = EV − AC, SV = EV − PV, CPI = EV ÷ AC, SPI = EV ÷ PV, EAC = BAC ÷ CPI |

**Conventions:** durations are whole days. An activity starts as soon as every predecessor has finished (no lags or overlaps) and activities with no predecessor start at day 0. ES/EF are earliest start and finish, LS/LF latest start and finish, counted in days from the start of the project. Free float is the delay an activity can take without delaying the earliest start of the next activities. Crashing shortens an activity by whole days at a stated cost per day. Work runs Monday to Friday and the start date is day 1, so *n* working days end on the *n*th working day. Money is a generic `$`. Every index in a question works out exactly to 2 decimal places, and each question states the rule it needs (for example "a positive SV means ahead of schedule").

> [!TIP]
> Type dates as `20 July 2027`. Type money amounts as plain numbers with no `$` and no commas, for example `48000`, and use a minus sign for a negative variance.

| Level | What to expect |
| --- | --- |
| Easy | Five-activity networks, float from given times, one working-day finish date, a single variance |
| Medium | Six activities, the critical path and the activity with most float, the effect of a delay, CPI, SPI and EAC |
| Hard | Shortening or delaying activities, free float, holidays, all four variances and indexes, ETC |
| Expert | Earliest/latest start and delayed projects, crashing at least cost, linked tasks with holidays, forecasts and status |
