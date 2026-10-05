# Worked Time Calculator

Compute total worked hours and overtime from a list of shifts, subtracting
unpaid breaks and rounding to a configurable interval. ESM, zero dependencies,
Node standard library only.

```js
import {
  WorkedTimeCalculator,
  totalWorkedMinutes,
  totalWorkedHours,
  overtimeMinutes,
} from 'worked-time-calculator';

// Per-shift use with a fixed rounding granularity.
const calc = new WorkedTimeCalculator(15); // round to nearest 15 minutes
const minutes = calc.totalMinutes([
  { start: 540, end: 1020, breakMinutes: 30 }, // 09:00–17:00, 30m unpaid break
]);
const overtime = calc.overtimeMinutes(
  [{ start: 540, end: 1260 }],
  480, // threshold: 8 hours
);

// Or as plain functions.
const total = totalWorkedMinutes([{ start: 540, end: 1020 }]);
const hours = totalWorkedHours([{ start: 540, end: 1020 }], 15);
```

Exported names: `roundMinutes`, `workedMinutesForShift`, `totalWorkedMinutes`,
`totalWorkedHours`, `overtimeMinutes`, `WorkedTimeCalculator`.

## Why this exists

Payroll calculations live or die on three rules: unpaid breaks come off the
worked total, short stints round to a pay interval, and overtime is whatever
remains above a threshold. Doing these ad hoc in business code is where the
missing-ten-minutes bug lives. This library does exactly those three things and
nothing else.

The deliberate trade-off: times are minutes-of-day (0..1439), not `Date`
objects. A night shift that crosses midnight is the primary case the library
exists to handle, and anchoring to a `Date` would force a timezone decision the
caller never asked for. If `start > end`, the shift is treated as continuing
into the next day. The caller owns the calendar; this library owns the
arithmetic.

## Edge you will hit

Rounding is applied once to the aggregate worked total, not per shift. Two short
shifts that each round down to zero still sum to a value that may round up at
the end. This is the intended behaviour — rounding per shift then summing would
systematically underpay anyone whose shifts happen to straddle a rounding
boundary. Overtime, by contrast, is rounded on its own portion only: rounding
the total before subtracting the threshold yields a different result than
subtracting then rounding, and payroll convention is to round the overtime the
worker actually accrues.

Half-interval values round up. A 7.5-minute overtime on a 15-minute interval is
paid as 15 minutes. This matches the common convention; if your jurisdiction
requires round-to-even, this library is not it.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

