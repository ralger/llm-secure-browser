/**
 * TypeScript interfaces for all MCAS API response shapes.
 */

// ── Today's Attendance ────────────────────────────────────────────────────────

export interface AttendanceMark {
  /** Human-readable status from the icon title attribute */
  status: string;
  /** Subject name (e.g. "Tutor Group") */
  subject: string;
}

export interface ChildTodayAttendance {
  name: string;
  studentId: number;
  /** AM register mark */
  am: AttendanceMark | null;
  /** PM register mark */
  pm: AttendanceMark | null;
}

export interface TodayAttendanceResult {
  fetchedAt: string;
  children: ChildTodayAttendance[];
}

// ── Weekly Summary ────────────────────────────────────────────────────────────

export interface DailyAttendance {
  /** ISO date string, e.g. "2026-03-03" */
  date: string;
  /**
   * One of: Present | AuthorisedAbsent | UnauthorisedAbsent | Late |
   *         NotTaken | NotRequired | FutureDate | Unknown
   */
  status: string;
}

export interface BehaviourEvent {
  /** ISO date string */
  date: string;
  /** positive | negative */
  type: string;
  /** Event description, e.g. "CS - Being an active learner" */
  event: string;
  /** Class code, e.g. "7A/Hi" */
  class: string;
  /** Subject name */
  subject: string;
  /** Teacher name */
  teacher: string;
}

export interface Detention {
  /** Display date string as returned by API, e.g. "03/03/2026" */
  date: string;
  /** Detention type label */
  type: string;
  /** Session code, e.g. "AS" */
  session: string;
  /** Time range, e.g. "15:10 - 16:10" */
  times: string;
  /** Subject name */
  subject: string;
  /** Teacher name */
  teacher: string;
  /** Room identifier */
  room: string;
  /** Whether the student attended the detention */
  attended: boolean;
  /** Optional comment from teacher */
  comment: string;
}

export interface ChildWeeklySummary {
  name: string;
  studentId: number;
  /** Daily attendance marks for the last 7 school days */
  attendance: DailyAttendance[];
  /** All behaviour events in the last 7 days */
  behaviour: BehaviourEvent[];
  /** Detentions within the last 7 days */
  detentions: Detention[];
}

export interface WeeklySummaryResult {
  fetchedAt: string;
  /** ISO date — start of the 7-day window */
  weekFrom: string;
  /** ISO date — end of the 7-day window (today) */
  weekTo: string;
  children: ChildWeeklySummary[];
}

// ── Classes & Timetable ───────────────────────────────────────────────────────

export interface ClassInfo {
  /** Class code, e.g. "7A/Hi" */
  code: string;
  /** Subject name, e.g. "History" */
  subject: string;
  /** Teacher name, e.g. "Mr D Horne" */
  teacher: string;
}

export interface TimetableLesson {
  subject: string;
  classCode: string;
  teacher: string;
}

export interface TimetablePeriod {
  /** Period label: "AM", "1", "2", "3", "4", "5", "AS" */
  period: string;
  monday: TimetableLesson | null;
  tuesday: TimetableLesson | null;
  wednesday: TimetableLesson | null;
  thursday: TimetableLesson | null;
  friday: TimetableLesson | null;
}

export interface TimetableWeek {
  /** ISO date for Monday of the displayed week */
  weekCommencing: string;
  periods: TimetablePeriod[];
}

export interface ChildClassesInfo {
  name: string;
  studentId: number;
  classes: ClassInfo[];
  timetable: TimetableWeek;
}

export interface ClassesResult {
  fetchedAt: string;
  children: ChildClassesInfo[];
}
