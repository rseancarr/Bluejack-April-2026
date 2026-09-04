// Stage-event recording rules (pure). DB writes live in app/actions/deals.ts.
import { isStage, type Stage } from "../constants";

export class StageChangeError extends Error {}

export interface StageChangeInput {
  currentStage: string;
  newStage: string;
  passReason?: string | null;
  at?: Date;
}

export interface StageChangePlan {
  /** Whether a new DealStageEvent row must be appended. */
  appendEvent: boolean;
  event?: { stage: Stage; enteredAt: Date };
  /** Fields to update on the Deal. */
  dealUpdate: { stage: Stage; passReason: string | null };
}

/**
 * Decide what a stage change should write.
 *  - Unknown stage → throws (never store an invalid stage).
 *  - Same stage → no event appended (re-dropping a card on its own column is a no-op).
 *  - Entering Passed requires a non-empty pass reason.
 *  - Leaving Passed clears the pass reason.
 *  - Timestamp must be a valid date (defaults to now).
 */
export function planStageChange(input: StageChangeInput): StageChangePlan {
  const { currentStage, newStage } = input;
  if (!isStage(newStage)) throw new StageChangeError(`Unknown stage "${newStage}"`);
  const at = input.at ?? new Date();
  if (Number.isNaN(at.getTime())) throw new StageChangeError("Invalid stage-change timestamp");

  if (newStage === "Passed") {
    const reason = (input.passReason ?? "").trim();
    if (!reason) throw new StageChangeError("A pass reason is required to move a deal to Passed");
    if (currentStage === "Passed") return { appendEvent: false, dealUpdate: { stage: "Passed", passReason: reason } };
    return { appendEvent: true, event: { stage: "Passed", enteredAt: at }, dealUpdate: { stage: "Passed", passReason: reason } };
  }

  if (currentStage === newStage) return { appendEvent: false, dealUpdate: { stage: newStage, passReason: null } };
  return { appendEvent: true, event: { stage: newStage, enteredAt: at }, dealUpdate: { stage: newStage, passReason: null } };
}

/**
 * Events to write when a deal is created. Exactly one event, for the stage the deal is
 * created in, timestamped at `dateSourced`. Earlier stages are never backfilled.
 */
export function planInitialEvents(stage: string, dateSourced: Date, passReason?: string | null) {
  if (!isStage(stage)) throw new StageChangeError(`Unknown stage "${stage}"`);
  if (Number.isNaN(dateSourced.getTime())) throw new StageChangeError("Invalid date sourced");
  if (stage === "Passed" && !(passReason ?? "").trim()) {
    throw new StageChangeError("A pass reason is required to create a deal as Passed");
  }
  return [{ stage, enteredAt: dateSourced }];
}
