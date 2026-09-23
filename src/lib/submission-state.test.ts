import { describe, expect, it } from "vitest";
import {
  canEditSubmission,
  canReviewSubmission,
  canSubmitForReview,
  canWithdrawSubmission,
  isSubmissionDecision,
  validateReviewNote,
} from "./submission-state";

describe("submission state machine", () => {
  it("lets authors edit and submit drafts, change requests and rejections only", () => {
    for (const status of ["draft", "changes_requested", "rejected"]) {
      expect(canEditSubmission(status)).toBe(true);
      expect(canSubmitForReview(status)).toBe(true);
    }
    for (const status of ["pending", "approved", "archived"]) {
      expect(canEditSubmission(status)).toBe(false);
      expect(canSubmitForReview(status)).toBe(false);
    }
  });

  it("limits withdrawing and reviewing to the pending state", () => {
    expect(canWithdrawSubmission("pending")).toBe(true);
    expect(canReviewSubmission("pending")).toBe(true);
    for (const status of ["draft", "changes_requested", "rejected", "approved", "archived"]) {
      expect(canWithdrawSubmission(status)).toBe(false);
      expect(canReviewSubmission(status)).toBe(false);
    }
  });

  it("accepts only the three review decisions", () => {
    expect(isSubmissionDecision("approved")).toBe(true);
    expect(isSubmissionDecision("rejected")).toBe(true);
    expect(isSubmissionDecision("changes_requested")).toBe(true);
    expect(isSubmissionDecision("draft")).toBe(false);
    expect(isSubmissionDecision(undefined)).toBe(false);
  });

  it("requires notes for negative decisions and never stores one for approvals", () => {
    expect(validateReviewNote("approved", "anything")).toBeNull();
    expect(validateReviewNote("rejected", "Ekran gorseli eksik.")).toBe("Ekran gorseli eksik.");
    expect(validateReviewNote("changes_requested", "  Surum notu ekle.  ")).toBe("Surum notu ekle.");
    expect(() => validateReviewNote("rejected", undefined)).toThrow(/3-1000/);
    expect(() => validateReviewNote("changes_requested", "ab")).toThrow(/3-1000/);
    expect(() => validateReviewNote("rejected", "x".repeat(1001))).toThrow(/3-1000/);
  });
});
