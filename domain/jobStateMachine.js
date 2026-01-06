export const JOB_TRANSITIONS = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function canTransition(current, next) {
  return JOB_TRANSITIONS[current]?.includes(next);
}
