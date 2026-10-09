// Hybrid (phone-as-authenticator) policy. Decision CR-5, 2026-10-09: option A approved.
// The existing upstream tunnel relays (Google/Apple-operated) are used ONLY when the user clicks
// "use your phone"; never at idle, never prefetched. A user setting turns hybrid off entirely.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.

export interface HybridSettings { enabled: boolean; warningAcknowledged: boolean }
export const DEFAULT_HYBRID: HybridSettings = { enabled: true, warningAcknowledged: false };

export type HybridDecision =
  | { allow: true }
  | { allow: false; reason: 'disabled-by-user' | 'not-user-initiated' | 'warning-required' };

/** Called by the discovery factory hook before ANY hybrid/caBLE network or BLE-advert activity. */
export function decideHybrid(s: HybridSettings, ctx: { userClickedUsePhone: boolean }): HybridDecision {
  if (!s.enabled) return { allow: false, reason: 'disabled-by-user' };
  if (!ctx.userClickedUsePhone) return { allow: false, reason: 'not-user-initiated' };
  if (!s.warningAcknowledged) return { allow: false, reason: 'warning-required' };
  return { allow: true };
}
