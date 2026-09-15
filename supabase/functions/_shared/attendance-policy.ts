export type CompensationInput = {
  sourceKind: "OVER" | "SHORT";
  sourceMinutes: number;
  nextDayOppositeMinutes: number;
};

export type CompensationResult = {
  appliedMinutes: number;
  outcome: "APPLIED" | "EXPIRED" | "DEDUCTION_PENDING";
  carryForwardMinutes: 0;
};

export function requiredMinutesForLeave(
  duration: "FULL_DAY" | "HALF_DAY_AM" | "HALF_DAY_PM",
) {
  return duration === "FULL_DAY" ? 0 : 240;
}

export function correctionDeduction(sequence: number) {
  return sequence >= 3 ? 200 : 0;
}

export function settleNextWorkday(input: CompensationInput): CompensationResult {
  const sourceMinutes = Math.max(0, Math.round(input.sourceMinutes));
  const oppositeMinutes = Math.max(0, Math.round(input.nextDayOppositeMinutes));
  const appliedMinutes = Math.min(sourceMinutes, oppositeMinutes);

  if (appliedMinutes > 0) {
    return { appliedMinutes, outcome: "APPLIED", carryForwardMinutes: 0 };
  }

  return {
    appliedMinutes: 0,
    outcome: input.sourceKind === "OVER" ? "EXPIRED" : "DEDUCTION_PENDING",
    carryForwardMinutes: 0,
  };
}
