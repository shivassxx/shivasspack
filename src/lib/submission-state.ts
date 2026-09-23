/** Pure submission state rules shared by the service layer and client forms. */

export class SubmissionError extends Error {
  constructor(
    readonly code: "validation" | "not_found" | "conflict",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

export type SubmissionDecision = "approved" | "rejected" | "changes_requested";

/** Author editing and (re)submitting are allowed in exactly these states. */
const authorEditable = new Set<string>(["draft", "changes_requested", "rejected"]);

export function canEditSubmission(status: string): boolean {
  return authorEditable.has(status);
}

export function canSubmitForReview(status: string): boolean {
  return authorEditable.has(status);
}

export function canWithdrawSubmission(status: string): boolean {
  return status === "pending";
}

export function canReviewSubmission(status: string): boolean {
  return status === "pending";
}

export function isSubmissionDecision(value: unknown): value is SubmissionDecision {
  return value === "approved" || value === "rejected" || value === "changes_requested";
}

/** A note is mandatory for negative decisions and never stored for approvals. */
export function validateReviewNote(decision: unknown, note: unknown): string | null {
  if (decision !== "rejected" && decision !== "changes_requested") return null;
  const clean = typeof note === "string" ? note.trim().replace(/\r\n/g, "\n") : "";
  if (clean.length < 3 || clean.length > 1000) {
    throw new SubmissionError("validation", "İnceleme notu 3-1000 karakter olmalı.", 400);
  }
  return clean;
}

export const submissionStatusLabels: Record<string, string> = {
  draft: "Taslak",
  pending: "İncelemede",
  approved: "Yayında",
  rejected: "Reddedildi",
  changes_requested: "Değişiklik istendi",
  archived: "Arşivlendi",
};

export const submissionStatusClass: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  changes_requested: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  archived: "bg-zinc-600/20 text-zinc-500 border-zinc-600/40",
};
