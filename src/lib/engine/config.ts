export const ENGINE_VERSION = "1.0.0";

// Every tunable number lives here. SOURCED = taken from a published study or
// position stand (URL in the comment). HEURISTIC = our own design default; the
// literature gives no number, so these are not medical advice and are meant to
// be tuned. Load increments are in the athlete's own unit (lb or kg).
export const ENGINE_CONFIG = {
  // Most recent sessions of one planned exercise the engine looks at.
  // HEURISTIC: enough to see two stalled sessions plus a comparison baseline.
  historyLimit: 8,

  // Hard ceiling on reps per set. After this a harder variation is forced.
  // HEURISTIC, anchored on https://pubmed.ncbi.nlm.nih.gov/25853914/ (25-35 rep sets grow muscle).
  repCap: 30,

  // A load jump larger than this share of the current load is not taken directly.
  // SOURCED: https://pubmed.ncbi.nlm.nih.gov/19204579/ (ACSM: raise load 2-10%).
  maxJumpPct: 10,

  // Reps of extra headroom granted per 1% of load jump when the jump is too big.
  // HEURISTIC: about 2-2.5% load per rep, extrapolated from https://hdl.handle.net/10292/10669 (Helms 2016, 1-8 rep table).
  jumpPctPerRep: 2.5,

  // A set may end this many reps of reserve below the prescribed RIR and still count as on target.
  // HEURISTIC: reported RIR runs about 1 rep conservative, https://pubmed.ncbi.nlm.nih.gov/34542869/ (Halperin 2022).
  rirTolerance: 1,

  // Above this many reps RIR is too unreliable to drive progression, reps decide.
  // SOURCED: https://pubmed.ncbi.nlm.nih.gov/34542869/ (Halperin 2022, accuracy collapses past 12 reps).
  rirIgnoredAboveReps: 12,

  // Sessions in a row that must reach the ceiling at the same load before RIR-less sets allow an increase.
  // HEURISTIC: a repeat stands in for the missing effort rating (the "2-for-2" idea has no primary source).
  missingRirConfirmations: 2,

  // Consecutive stalled sessions that trigger a deload (loaded work) or a regression (bodyweight work).
  // HEURISTIC: no published N, https://journal.iusca.org/index.php/Journal/article/view/81 only says to change the stimulus when stagnation occurred.
  stallSessions: 2,

  // Share of load removed when a stall triggers a deload.
  // HEURISTIC: https://pubmed.ncbi.nlm.nih.gov/29628895/ (Helms 2018, about 4% per RIR or missed rep) scaled to a session-level reset.
  deloadPct: 0.1,

  // Performed load and planned load further apart than this ratio are treated as a logging mistake.
  // HEURISTIC: guards against a typo such as 300 for 30 turning into a huge increase.
  loadMismatchRatio: 2.5,

  // Fixed load steps when neither the equipment profile nor the exercise sets one.
  // HEURISTIC: common plate and dumbbell rack sizes; ACSM's 2-10% band is enforced separately by maxJumpPct.
  increments: {
    lb: { dumbbell: 5, barbellUpper: 5, barbellLower: 10, kettlebell: 8, machine: 5, other: 5 },
    kg: { dumbbell: 2.5, barbellUpper: 2.5, barbellLower: 5, kettlebell: 4, machine: 2.5, other: 2.5 },
  },

  // Days since the last session of this day (or this exercise, whichever is longer).
  // Day cutoffs are HEURISTIC: https://doi.org/10.1111/sms.12047 (Bosquet) shows loss grows with time off but gives no thresholds.
  gap: {
    // Up to this many days off is normal training. SOURCED-informed: https://doi.org/10.7717/peerj.16777 (a week off costs little size).
    normalMaxDays: 7,
    // Up to this many days: repeat the last load, no progression. HEURISTIC (weak support: Hwang 2017).
    repeatMaxDays: 14,
    // Beyond repeatMaxDays: cut the load by this share, tier chosen by the first maxDays that fits.
    // HEURISTIC; the 15% tier is anchored on https://ro.ecu.edu.au/ecuworks2013/788 (McMaster, about -14.5% after about 7 weeks).
    cuts: [
      { maxDays: 28, cutPct: 0.1 },
      { maxDays: 56, cutPct: 0.15 },
      { maxDays: Number.POSITIVE_INFINITY, cutPct: 0.25 },
    ],
    // Reps-only exercises step back one variation after more than this many days off. HEURISTIC.
    regressAfterDays: 56,
  },

  // Poor recovery trend: hold instead of increasing. Each key carries its own tag.
  recovery: {
    // Only logs from this many days before `now` count. HEURISTIC.
    windowDays: 7,
    // The newest this-many logs inside the window are judged. HEURISTIC.
    logsConsidered: 3,
    // A trend needs at least this many poor days among them. HEURISTIC.
    poorDaysRequired: 2,
    // A night under this many hours is a poor day. SOURCED: https://doi.org/10.1007/s40279-022-01706-y (Craven 2022, 6 h or less cuts strength).
    poorSleepHours: 6,
    // Soreness at or above this (1-5 scale, 5 = very sore) is a poor day. HEURISTIC, mirrors RP soreness 4 = still sore.
    poorSoreness: 4,
  },

  // Do not increase when the athlete is mostly missing planned sessions.
  // HEURISTIC (both values): too little exposure to judge readiness for more load.
  adherence: {
    minPlannedSessions: 4,
    minRatio: 0.5,
  },
} as const;
