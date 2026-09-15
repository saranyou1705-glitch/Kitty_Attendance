export type CompensationInput = {
  sourceKind: "OVER" | "SHORT";
  sourceMinutes: number;
  nextDayOppositeMinutes: number;
};

export type CompensationResult = {
  appliedMinutes: number;
  expiredMinutes: number;
  deductionPendingMinutes: number;
  outcome: "APPLIED" | "PARTIAL" | "EXPIRED" | "DEDUCTION_PENDING";
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
  const remainder = sourceMinutes - appliedMinutes;

  return {
    appliedMinutes,
    expiredMinutes: input.sourceKind === "OVER" ? remainder : 0,
    deductionPendingMinutes: input.sourceKind === "SHORT" ? remainder : 0,
    outcome: appliedMinutes > 0
      ? (remainder > 0 ? "PARTIAL" : "APPLIED")
      : (input.sourceKind === "OVER" ? "EXPIRED" : "DEDUCTION_PENDING"),
    carryForwardMinutes: 0,
  };
}
