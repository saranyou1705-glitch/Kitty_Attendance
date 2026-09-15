import assert from "node:assert/strict";
import test from "node:test";
import {
  correctionDeduction,
  requiredMinutesForLeave,
  settleNextWorkday,
} from "./attendance-policy.ts";

test("half-day leave requires four net working hours", () => {
  assert.equal(requiredMinutesForLeave("FULL_DAY"), 0);
  assert.equal(requiredMinutesForLeave("HALF_DAY_AM"), 240);
  assert.equal(requiredMinutesForLeave("HALF_DAY_PM"), 240);
});

test("only the third and later approved corrections cost 200 baht", () => {
  assert.equal(correctionDeduction(1), 0);
  assert.equal(correctionDeduction(2), 0);
  assert.equal(correctionDeduction(3), 200);
  assert.equal(correctionDeduction(7), 200);
});

test("overtime offsets only the next workday shortage and never carries", () => {
  assert.deepEqual(settleNextWorkday({
    sourceKind: "OVER",
    sourceMinutes: 90,
    nextDayOppositeMinutes: 45,
  }), { appliedMinutes: 45, outcome: "APPLIED", carryForwardMinutes: 0 });

  assert.deepEqual(settleNextWorkday({
    sourceKind: "OVER",
    sourceMinutes: 90,
    nextDayOppositeMinutes: 0,
  }), { appliedMinutes: 0, outcome: "EXPIRED", carryForwardMinutes: 0 });
});

test("unmatched shortage becomes deduction pending and never carries", () => {
  assert.deepEqual(settleNextWorkday({
    sourceKind: "SHORT",
    sourceMinutes: 30,
    nextDayOppositeMinutes: 0,
  }), { appliedMinutes: 0, outcome: "DEDUCTION_PENDING", carryForwardMinutes: 0 });
});
