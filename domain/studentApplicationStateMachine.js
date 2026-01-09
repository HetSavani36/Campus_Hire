export const STUDENT_APPLICATION_TRANSITIONS = {
  pending: ["shortlisted", "rejected"],
  shortlisted: ["hired","rejected"],
  rejected: [],
  hired:[]
};

export function canStudentApplicationTransition(current, next) {
  return STUDENT_APPLICATION_TRANSITIONS[current]?.includes(next);
}
