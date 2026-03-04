/**
 * MCAS (My Child At School) site configuration.
 * All URLs, selectors, student IDs, and constants live here.
 *
 * Explored via Playwright MCP on 2026-03-03.
 * Login app host: www.mychildatschool.com
 * School: St Ignatius College
 */
export const MCAS_CONFIG = {
  siteId: 'mcas',
  name: 'My Child At School',
  baseUrl: 'https://www.mychildatschool.com',
  loginUrl: 'https://www.mychildatschool.com/MCAS/MCSParentLogin',
  dashboardUrl: 'https://www.mychildatschool.com/MCAS/MCSDashboardPage',
  attendanceUrl: 'https://www.mychildatschool.com/MCAS/MCSAttendanceReports.aspx',
  timetableUrl: 'https://www.mychildatschool.com/MCAS/MCSTimetable.aspx',

  /** API proxy endpoint (relative — called from within the logged-in browser context) */
  apiProxyGetUrl: '/MCAS/WebServices/MCSAPIRequestProxy.asmx/CreateGetRequest',

  /** Env-var keys for credential lookup */
  credentials: {
    usernameKey: 'SITE_MCAS_USERNAME',
    passwordKey: 'SITE_MCAS_PASSWORD',
  },

  /**
   * Students linked to this parent account.
   * schoolSwitchParam (12915) is a school/registration context ID required
   * by onClickStudentDropdownItem().
   */
  students: [
    { name: 'Samuel', studentId: 10732 },
    { name: 'Emmanuel', studentId: 10734 },
  ] as const,

  /** Required by the child-switch JS function: onClickStudentDropdownItem(schoolSwitchParam, studentId, true) */
  schoolSwitchParam: 12915,

  /**
   * Academic year ID for 2025/2026 — used in behaviour events API calls.
   * Update here if the year ID changes.
   * Confirmed from: api/v1/timetable/mcas/years/{studentId} → Table[0].YearID
   */
  currentYearId: 18834,

  selectors: {
    login: {
      emailInput: '#EmailTextBox',
      passwordInput: '#PasswordTextBox',
      loginButton: '#LoginButton',
    },
  },

  /**
   * Attendance calendar background-color hex codes → human-readable status.
   * Colors are compared case-insensitively after normalisation.
   */
  attendanceColors: {
    '#94c140': 'Present',
    '#7094ff': 'AuthorisedAbsent',
    '#ff0000': 'UnauthorisedAbsent',
    '#ff82c6': 'Late',
    '#ffff00': 'NotTaken',
    '#f2f0f1': 'NotRequired',
    '#a2a2a2': 'FutureDate',
  } as Record<string, string>,

  /** Default status for unrecognised attendance color */
  attendanceColorDefault: 'Unknown',

  /** FontAwesome icon classes used in behaviour events */
  behaviourIcons: {
    positive: 'fa-check-circle',
    negative: 'fa-times-circle',
  },
} as const;
