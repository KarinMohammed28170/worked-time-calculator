import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundMinutes,
  workedMinutesForShift,
  totalWorkedMinutes,
  totalWorkedHours,
  overtimeMinutes,
  WorkedTimeCalculator,
} from '../src/index.js';

test('roundMinutes rounds down below half', () => {
  assert.equal(roundMinutes(7, 15), 0);
});

test('roundMinutes rounds up at exact half', () => {
  // 7.5 minutes is half of 15; convention is round up.
  assert.equal(roundMinutes(7.5, 15), 15);
});

test('roundMinutes rounds up above half', () => {
  assert.equal(roundMinutes(8, 15), 15);
});

test('roundMinutes handles negative values symmetrically', () => {
  assert.equal(roundMinutes(-7, 15), 0);
  assert.equal(roundMinutes(-7.5, 15), -15);
});

test('roundMinutes rejects non-positive interval', () => {
  assert.throws(() => roundMinutes(10, 0), /positive integer/);
  assert.throws(() => roundMinutes(10, -5), /positive integer/);
});

test('roundMinutes rejects non-integer interval', () => {
  assert.throws(() => roundMinutes(10, 7.5), /positive integer/);
});

test('workedMinutesForShift computes a normal day shift', () => {
  // 09:00 to 17:00 = 8h = 480 min.
  assert.equal(workedMinutesForShift(540, 1020), 480);
});

test('workedMinutesForShift handles a shift crossing midnight', () => {
  // 22:00 to 06:00 = 8h.
  assert.equal(workedMinutesForShift(1320, 360), 480);
});

test('workedMinutesForShift is zero when start equals end', () => {
  assert.equal(workedMinutesForShift(600, 600), 0);
});

test('workedMinutesForShift rejects out-of-range times', () => {
  assert.throws(() => workedMinutesForShift(-1, 100), /0\.\.1439/);
  assert.throws(() => workedMinutesForShift(0, 1440), /0\.\.1439/);
});

test('totalWorkedMinutes sums shifts and subtracts breaks', () => {
  const shifts = [
    { start: 540, end: 1020, breakMinutes: 30 }, // 480 - 30
    { start: 1020, end: 1260, breakMinutes: 0 },  // 240
  ];
  assert.equal(totalWorkedMinutes(shifts), 690);
});

test('totalWorkedMinutes treats missing break as zero', () => {
  const shifts = [{ start: 540, end: 1020 }];
  assert.equal(totalWorkedMinutes(shifts), 480);
});

test('totalWorkedMinutes can go negative if breaks exceed work', () => {
  // Deliberate: the contract is signed. Callers who want clamping do it.
  const shifts = [{ start: 540, end: 600, breakMinutes: 90 }];
  assert.equal(totalWorkedMinutes(shifts), -30);
});

test('totalWorkedMinutes rejects a non-array', () => {
  assert.throws(() => totalWorkedMinutes(null), /array/);
});

test('totalWorkedMinutes rejects a non-object element', () => {
  assert.throws(() => totalWorkedMinutes([42]), /object/);
});

test('totalWorkedMinutes rejects negative break', () => {
  assert.throws(
    () => totalWorkedMinutes([{ start: 0, end: 60, breakMinutes: -5 }]),
    /non-negative/,
  );
});

test('totalWorkedHours rounds the aggregate then converts to hours', () => {
  // Two 4-minute shifts => 8 min total, rounds to 15 at 15-min granularity
  // (8 is above half of 15), so 0.25 hours.
  const shifts = [
    { start: 0, end: 4 },
    { start: 4, end: 8 },
  ];
  assert.equal(totalWorkedHours(shifts, 15), 0.25);
});

test('totalWorkedHours returns 2-decimal hours', () => {
  const shifts = [{ start: 540, end: 660 }]; // 120 min -> 2.00h
  assert.equal(totalWorkedHours(shifts, 15), 2);
});

test('overtimeMinutes is zero when under threshold', () => {
  const shifts = [{ start: 540, end: 1020 }]; // 480 min
  assert.equal(overtimeMinutes(shifts, 480, 15), 0);
});

test('overtimeMinutes is zero when exactly at threshold', () => {
  const shifts = [{ start: 540, end: 1020 }];
  assert.equal(overtimeMinutes(shifts, 480, 15), 0);
});

test('overtimeMinutes rounds the overtime portion only', () => {
  // Worked 485, threshold 480 => 5 min overtime, rounds to 0 at 15-min.
  const shifts = [{ start: 540, end: 1025 }];
  assert.equal(overtimeMinutes(shifts, 480, 15), 0);
});

test('overtimeMinutes rounds up at half interval', () => {
  // Worked 487, threshold 479.5 => 7.5 min overtime, rounds to 15.
  const shifts = [{ start: 540, end: 1027 }];
  assert.equal(overtimeMinutes(shifts, 479.5, 15), 15);
});

test('WorkedTimeCalculator uses a fixed interval', () => {
  const calc = new WorkedTimeCalculator(15);
  const shifts = [{ start: 540, end: 1020, breakMinutes: 30 }]; // 450 min
  assert.equal(calc.totalMinutes(shifts), 450);
  assert.equal(calc.totalHours(shifts), 7.5);
});

test('WorkedTimeCalculator.shiftMinutes rounds a single shift', () => {
  const calc = new WorkedTimeCalculator(15);
  // 543 min worked, 30 break => 513, rounds to 510.
  assert.equal(
    calc.shiftMinutes({ start: 540, end: 1083, breakMinutes: 30 }),
    510,
  );
});

test('WorkedTimeCalculator.overtimeMinutes delegates correctly', () => {
  const calc = new WorkedTimeCalculator(15);
  const shifts = [{ start: 540, end: 1020 }]; // 480
  assert.equal(calc.overtimeMinutes(shifts, 480), 0);
});

test('WorkedTimeCalculator rejects non-positive interval', () => {
  assert.throws(() => new WorkedTimeCalculator(0), /positive integer/);
});

test('night shift with unpaid break computes correctly', () => {
  // 22:00 -> 06:00 = 480 min, minus 30 unpaid break = 450.
  const shifts = [{ start: 1320, end: 360, breakMinutes: 30 }];
  assert.equal(totalWorkedMinutes(shifts), 450);
});
