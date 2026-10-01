/**
 * Worked Time Calculator.
 *
 * Times are expressed as minutes-of-day (0..1439). A time is a number rather
 * than a Date because the library deliberately ignores calendar dates: a night
 * shift that crosses midnight is the whole reason the clock crosses 24h, and
 * anchoring to a date would force a timezone decision the caller did not ask
 * for. Minutes-of-day keeps the surface tiny and the caller in control.
 *
 * All durations are returned in minutes (integers) or hours (rounded to 2 dp).
 * Returning minutes as integers means callers can round, compare, and format
 * without float-equality surprises; hours are only ever a presentation form.
 */

/**
 * Round a value in minutes to the nearest multiple of `intervalMinutes`.
 *
 * Half values round UP. This matches the common payroll convention: if someone
 * works 7.5 of an 8-minute interval, the interval is paid; rounding down would
 * systematically underpay by a fraction every period.
 *
 * @param {number} minutes - the duration to round (may be negative).
 * @param {number} intervalMinutes - the rounding granularity, in minutes.
 * @returns {number} an integer number of minutes.
 */
export function roundMinutes(minutes, intervalMinutes) {
  if (!Number.isFinite(minutes)) {
    throw new TypeError(`minutes must be a finite number, got ${minutes}`);
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new TypeError(
      `intervalMinutes must be a positive integer, got ${intervalMinutes}`,
    );
  }
  const sign = minutes < 0 ? -1 : 1;
  const abs = Math.abs(minutes);
  const steps = Math.floor(abs / intervalMinutes);
  const remainder = abs - steps * intervalMinutes;
  const rounded =
    remainder * 2 >= intervalMinutes ? steps + 1 : steps;
  const result = sign * rounded * intervalMinutes;
  return result === 0 ? 0 : result;
}

/**
 * Compute worked minutes for a single shift, before rounding and before breaks.
 *
 * Shifts that cross midnight are the intended use case: if `start > end`, the
 * shift is treated as continuing into the next day and `end + 1440` is used.
 * The caller chooses this by the ordering of their two numbers; no flag needed.
 *
 * @param {number} start - start time, minutes-of-day (0..1439).
 * @param {number} end - end time, minutes-of-day (0..1439).
 * @returns {number} non-negative integer minutes.
 */
export function workedMinutesForShift(start, end) {
  validateTimeOfDay(start, 'start');
  validateTimeOfDay(end, 'end');
  const span = end >= start ? end - start : end + 1440 - start;
  return span;
}

/**
 * Sum of worked minutes across shifts, with unpaid breaks subtracted per
 * shift. No rounding here — the contract is that durations are aggregated
 * before rounding, so that two short shifts that each round down still sum to
 * a value that may round up at the end. Rounding once at the end is the point.
 *
 * @param {Array<{start:number,end:number,breakMinutes?:number}>} shifts
 * @returns {number} integer minutes (may be negative if breaks exceed work).
 */
export function totalWorkedMinutes(shifts) {
  if (!Array.isArray(shifts)) {
    throw new TypeError(`shifts must be an array, got ${typeof shifts}`);
  }
  let total = 0;
  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i];
    if (s === null || typeof s !== 'object') {
      throw new TypeError(`shifts[${i}] must be an object, got ${typeof s}`);
    }
    const worked = workedMinutesForShift(s.start, s.end);
    const brk = s.breakMinutes ?? 0;
    if (!Number.isFinite(brk) || brk < 0) {
      throw new TypeError(
        `shifts[${i}].breakMinutes must be a non-negative number, got ${brk}`,
      );
    }
    total += worked - brk;
  }
  return total;
}

/**
 * Total worked minutes, rounded to `intervalMinutes`, expressed in hours.
 * Hours are rounded to 2 decimal places purely for display; the value is
 * computed from integer minutes so it is stable.
 *
 * @param {Array} shifts
 * @param {number} intervalMinutes
 * @returns {number} hours, 2 decimal places.
 */
export function totalWorkedHours(shifts, intervalMinutes) {
  const mins = roundMinutes(totalWorkedMinutes(shifts), intervalMinutes);
  return Math.round((mins / 60) * 100) / 100;
}

/**
 * Overtime minutes relative to `thresholdMinutes`. Negative values are clamped
 * to zero — overtime is defined as minutes worked beyond the threshold, not as
 * a signed surplus/shortfall. Use `totalWorkedMinutes` directly if you need
 * the signed shortfall.
 *
 * Rounding is applied to the overtime portion only, not to the total. This
 * matters when the threshold itself is a whole number of minutes (it almost
 * always is): rounding the total before subtracting would sometimes yield a
 * different result than subtracting then rounding, and payroll convention is
 * to round the overtime quantity the worker actually accrues.
 *
 * @param {Array} shifts
 * @param {number} thresholdMinutes
 * @param {number} intervalMinutes
 * @returns {number} non-negative integer minutes.
 */
export function overtimeMinutes(shifts, thresholdMinutes, intervalMinutes) {
  if (!Number.isFinite(thresholdMinutes)) {
    throw new TypeError(
      `thresholdMinutes must be a finite number, got ${thresholdMinutes}`,
    );
  }
  const total = totalWorkedMinutes(shifts);
  const over = total - thresholdMinutes;
  if (over <= 0) return 0;
  return roundMinutes(over, intervalMinutes);
}

/**
 * Internal: validate a minutes-of-day value.
 */
function validateTimeOfDay(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new TypeError(
      `${name} must be an integer 0..1439 (minutes of day), got ${value}`,
    );
  }
}

/**
 * Stateful wrapper exposing the same calculations with a fixed rounding
 * granularity, so callers do not thread `intervalMinutes` through every call.
 */
export class WorkedTimeCalculator {
  /**
   * @param {number} intervalMinutes - rounding granularity in minutes.
   */
  constructor(intervalMinutes) {
    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      throw new TypeError(
        `intervalMinutes must be a positive integer, got ${intervalMinutes}`,
      );
    }
    this.intervalMinutes = intervalMinutes;
  }

  /** @returns {number} integer minutes for one shift, breaks subtracted, rounded. */
  shiftMinutes(shift) {
    const worked = workedMinutesForShift(shift.start, shift.end);
    const brk = shift.breakMinutes ?? 0;
    return roundMinutes(worked - brk, this.intervalMinutes);
  }

  /**
   * Sum across shifts with breaks subtracted per-shift, then rounded once.
   * Note: this rounds the aggregate, not each shift — see {@link totalWorkedMinutes}.
   * @param {Array} shifts
   * @returns {number} integer minutes.
   */
  totalMinutes(shifts) {
    return roundMinutes(totalWorkedMinutes(shifts), this.intervalMinutes);
  }

  /** @returns {number} hours, 2 decimal places. */
  totalHours(shifts) {
    return totalWorkedHours(shifts, this.intervalMinutes);
  }

  /**
   * @param {Array} shifts
   * @param {number} thresholdMinutes
   * @returns {number} non-negative integer minutes.
   */
  overtimeMinutes(shifts, thresholdMinutes) {
    return overtimeMinutes(shifts, thresholdMinutes, this.intervalMinutes);
  }
}
