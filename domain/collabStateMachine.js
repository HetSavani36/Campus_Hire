export const COLLAB_TRANSITIONS = {
  pending: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export function canCollabTransition(current, next) {
  return COLLAB_TRANSITIONS[current]?.includes(next);
}
