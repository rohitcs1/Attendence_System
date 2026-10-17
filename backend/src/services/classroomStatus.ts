export function classroomStatus(hasValidActiveSession: boolean): 'GREEN' | 'RED' {
  return hasValidActiveSession ? 'GREEN' : 'RED';
}
