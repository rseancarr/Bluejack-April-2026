import { describe, expect, it } from "vitest";
import { planStageChange, planInitialEvents, StageChangeError } from "@/lib/pipeline/stageEvents";

describe("planStageChange", () => {
  it("appends an event when the stage changes", () => {
    const at = new Date("2026-03-01T00:00:00Z");
    const plan = planStageChange({ currentStage: "Sourced", newStage: "Screening", at });
    expect(plan.appendEvent).toBe(true);
    expect(plan.event).toEqual({ stage: "Screening", enteredAt: at });
    expect(plan.dealUpdate).toEqual({ stage: "Screening", passReason: null });
  });
  it("does not append when dropped on the same stage", () => {
    const plan = planStageChange({ currentStage: "IC", newStage: "IC" });
    expect(plan.appendEvent).toBe(false);
    expect(plan.event).toBeUndefined();
  });
  it("allows skipping stages and moving backwards (each is a stage entry)", () => {
    expect(planStageChange({ currentStage: "Sourced", newStage: "Closed" }).appendEvent).toBe(true);
    expect(planStageChange({ currentStage: "IC", newStage: "Screening" }).appendEvent).toBe(true);
  });
  it("requires a pass reason to enter Passed", () => {
    expect(() => planStageChange({ currentStage: "IC", newStage: "Passed" })).toThrow(StageChangeError);
    expect(() => planStageChange({ currentStage: "IC", newStage: "Passed", passReason: "   " })).toThrow(/pass reason/);
    const plan = planStageChange({ currentStage: "IC", newStage: "Passed", passReason: "Valuation" });
    expect(plan.appendEvent).toBe(true);
    expect(plan.dealUpdate).toEqual({ stage: "Passed", passReason: "Valuation" });
  });
  it("clears the pass reason when leaving Passed", () => {
    const plan = planStageChange({ currentStage: "Passed", newStage: "Screening", passReason: "old" });
    expect(plan.dealUpdate.passReason).toBeNull();
    expect(plan.appendEvent).toBe(true);
  });
  it("rejects unknown stages and invalid timestamps", () => {
    expect(() => planStageChange({ currentStage: "Sourced", newStage: "Diligence" })).toThrow(/Unknown stage/);
    expect(() => planStageChange({ currentStage: "Sourced", newStage: "" })).toThrow(StageChangeError);
    expect(() => planStageChange({ currentStage: "Sourced", newStage: "IC", at: new Date("nope") })).toThrow(/timestamp/);
  });
});

describe("planInitialEvents", () => {
  it("writes exactly one event at the creation stage, dated dateSourced", () => {
    const dt = new Date("2026-01-05T00:00:00Z");
    expect(planInitialEvents("Screening", dt)).toEqual([{ stage: "Screening", enteredAt: dt }]);
  });
  it("never backfills earlier stages", () => {
    expect(planInitialEvents("Closed", new Date())).toHaveLength(1);
  });
  it("validates stage, date, and pass reason", () => {
    expect(() => planInitialEvents("Nope", new Date())).toThrow(/Unknown stage/);
    expect(() => planInitialEvents("Sourced", new Date("x"))).toThrow(/Invalid date/);
    expect(() => planInitialEvents("Passed", new Date())).toThrow(/pass reason/);
    expect(planInitialEvents("Passed", new Date(), "too small")).toHaveLength(1);
  });
});
