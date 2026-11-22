// =============================================================================
// WYNOT WORLD WIDE — GLOBAL-IDENTITY-VALIDATOR
// DRAFT v0.2 — Pending founder sign-off
//
// Functions as Brand Director + QA Officer + Communications Reviewer + AI
// Governance Gate, combined. Nothing public-facing may leave the enterprise
// without clearing this gate. Also enforces the Six-Rank AI Governance Model
// at the handshake level (Section 3 / Section 5 of the governance document).
//
// v0.2: adds the Identity Gate per Decision G-03 / the WYNOT Identity
// Foundation (Governance Doc Section 1.3). A booking/payment AUTHORIZE or
// COMPLETE transition may not proceed — regardless of rank — without a
// verified identity.wynot_id resolved from MemberRegistry. This is distinct
// from the rank gate: rank asks "is this agent allowed to authorize
// anything," the identity gate asks "do we actually know who this is for."
// Both must pass.
// =============================================================================

import type { AgentHandshake } from "./agent-handshake.types.ts";

export type ValidatorOutcome = "Approved" | "Revise" | "Hold" | "Block";

export interface ValidatorCheckResult {
  outcome: ValidatorOutcome;
  failedChecks: string[];
  routedTo: RouteTarget;
  notes: string[];
}

export type RouteTarget =
  | "publishing_adapter"
  | "originating_agent"
  | "growth"
  | "momentum"
  | "compliance_command_guardian";

/** Design Law IDs whose failure triggers independent Compliance Command
 * Guardian halt authority, regardless of CEO/COO sign-off. */
const COMPLIANCE_GATED_LAWS = new Set([14, 18, 19, 20, 21]);

export interface ContentSubmission {
  handshake: AgentHandshake;
  brandRepresented: boolean;
  tribeRepresented: boolean;
  correctBrandBoard: boolean;
  voiceMatchesWynot: boolean;
  alignedToMission: boolean;
  accessibilityChecked: boolean; // WCAG 2.2 AA
  seoAeoGeoPresent: boolean;
  designLawFailures: number[]; // list of failed Design Law numbers, e.g. [14, 24]
  prohibitedGuaranteesOrRiskyClaims: boolean;
}

/**
 * validateSubmission — the Global-Identity-Validator's pre-publish gate.
 *
 * Rank enforcement (fails closed): a submission whose handshake.sender.rank
 * is 5 or 6 requesting a publish/AUTHORIZE/COMPLETE action is rejected
 * before content checks even run — those actions are Rank-2-only or
 * Rank-6-deterministic-adapter-only, never a discretionary AI call.
 */
export function validateSubmission(sub: ContentSubmission): ValidatorCheckResult {
  const failedChecks: string[] = [];
  const notes: string[] = [];

  // --- Rank enforcement gate (runs first, fails closed) ---------------------
  const senderRank = sub.handshake.sender.rank;
  const requestsPublish = sub.handshake.next_action?.toLowerCase().includes("publish");
  const requestsAuthorize =
    sub.handshake.booking_status === "AUTHORIZED" || sub.handshake.booking_status === "COMPLETED";

  if ((requestsPublish || requestsAuthorize) && senderRank !== 2 && senderRank !== 6) {
    return {
      outcome: "Block",
      failedChecks: ["RANK_VIOLATION"],
      routedTo: "compliance_command_guardian",
      notes: [
        `Sender rank ${senderRank} attempted a publish/authorize action reserved for Rank 2 (human) or Rank 6 (deterministic adapter). Rejected before content review.`,
      ],
    };
  }

  // --- Identity gate (runs second, fails closed) — Decision G-03 ------------
  // A booking/payment AUTHORIZE or COMPLETE transition must carry a verified
  // wynot_id resolved from MemberRegistry. No agent, adapter, or rank may
  // substitute a locally-cached id, a CRM contact id, or an unverified guess.
  if (requestsAuthorize) {
    const identity = sub.handshake.identity;
    if (!identity) {
      return {
        outcome: "Block",
        failedChecks: ["IDENTITY_MISSING"],
        routedTo: "compliance_command_guardian",
        notes: [
          "AUTHORIZED/COMPLETED transition has no identity block. Per Decision G-03, no booking or payment may be authorized for an unresolved person.",
        ],
      };
    }
    if (identity.identity_status !== "verified") {
      return {
        outcome: "Block",
        failedChecks: ["IDENTITY_UNVERIFIED"],
        routedTo: "compliance_command_guardian",
        notes: [
          `identity.identity_status is '${identity.identity_status}', not 'verified'. Resolve against MemberRegistry (resolveIdentity) before authorizing.`,
        ],
      };
    }
  }

  // --- Compliance-gated Design Law check (independent halt authority) -------
  const complianceFailures = sub.designLawFailures.filter((law) => COMPLIANCE_GATED_LAWS.has(law));
  if (complianceFailures.length > 0) {
    return {
      outcome: "Block",
      failedChecks: complianceFailures.map((n) => `Design Law ${n}`),
      routedTo: "compliance_command_guardian",
      notes: [
        "Failure touches a Compliance Command Guardian-gated law (14/18/19/20/21). Halted independently of CEO/COO sign-off.",
      ],
    };
  }

  // --- Standard nine-point pre-publish checklist -----------------------------
  if (!sub.brandRepresented) failedChecks.push("Correct brand not represented");
  if (!sub.tribeRepresented) failedChecks.push("Correct tribe not represented");
  if (!sub.correctBrandBoard) failedChecks.push("Incorrect brand board");
  if (!sub.voiceMatchesWynot) failedChecks.push("Voice does not match WYNOT (Elite Mentor + Transformational Architect)");
  if (!sub.alignedToMission) failedChecks.push("Not aligned to mission");
  if (!sub.accessibilityChecked) failedChecks.push("Accessibility not verified (WCAG 2.2 AA)");
  if (!sub.seoAeoGeoPresent) failedChecks.push("SEO/AEO/GEO structured data missing");
  if (sub.designLawFailures.length > 0) {
    failedChecks.push(`Design Law failures: ${sub.designLawFailures.join(", ")}`);
  }
  if (sub.prohibitedGuaranteesOrRiskyClaims) {
    failedChecks.push("Contains prohibited guarantees or risky claims");
  }

  if (sub.prohibitedGuaranteesOrRiskyClaims) {
    return {
      outcome: "Block",
      failedChecks,
      routedTo: "compliance_command_guardian",
      notes: ["Prohibited guarantee/risky claim language blocks publication outright."],
    };
  }

  if (failedChecks.length === 0) {
    return { outcome: "Approved", failedChecks, routedTo: "publishing_adapter", notes };
  }

  const isFixableGap =
    !sub.seoAeoGeoPresent || !sub.correctBrandBoard || !sub.accessibilityChecked;
  if (isFixableGap && failedChecks.length <= 2) {
    return {
      outcome: "Revise",
      failedChecks,
      routedTo: "originating_agent",
      notes: ["Returned with itemized notes for correction by the originating Rank 4/5 agent."],
    };
  }

  // Ambiguous / needs human judgment
  const routedTo: RouteTarget = sub.handshake.priority === "urgent" ? "momentum" : "growth";
  return {
    outcome: "Hold",
    failedChecks,
    routedTo,
    notes: ["Ambiguous gap requiring executive judgment. Escalated per Section 6.3 routing order."],
  };
}
