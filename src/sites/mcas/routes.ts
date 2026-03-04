import type { FastifyPluginAsync } from 'fastify';
import { ICredentialProvider } from '../../core/credentials/index.js';
import { getTodayAttendance } from './actions/get-today-attendance.action.js';
import { getWeeklySummary } from './actions/get-weekly-summary.action.js';
import { getClasses } from './actions/get-classes.action.js';
import { MCAS_CONFIG } from './config.js';

interface RoutesOptions {
  credentialProvider: ICredentialProvider;
}

// ── Shared schema fragments ───────────────────────────────────────────────────

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

const AttendanceMarkSchema = {
  type: 'object',
  nullable: true,
  properties: {
    status: {
      type: 'string',
      example: 'Present',
      description:
        'One of: Present | AuthorisedAbsent | UnauthorisedAbsent | Late | NotTaken | NotRequired | FutureDate | Unknown',
    },
    subject: { type: 'string', example: 'Tutor Group' },
  },
};

const DailyAttendanceSchema = {
  type: 'object',
  properties: {
    date: { type: 'string', format: 'date', example: '2026-03-03' },
    status: {
      type: 'string',
      example: 'Present',
      description:
        'One of: Present | AuthorisedAbsent | UnauthorisedAbsent | Late | NotTaken | NotRequired | FutureDate | Unknown',
    },
  },
};

const BehaviourEventSchema = {
  type: 'object',
  properties: {
    date: { type: 'string', format: 'date', example: '2026-03-03' },
    type: { type: 'string', enum: ['positive', 'negative'], example: 'positive' },
    event: { type: 'string', example: 'CS - Being an active learner' },
    class: { type: 'string', example: '7A/Hi' },
    subject: { type: 'string', example: 'History' },
    teacher: { type: 'string', example: 'Mr D Horne' },
  },
};

const DetentionSchema = {
  type: 'object',
  properties: {
    date: { type: 'string', example: '03/03/2026' },
    type: { type: 'string', example: 'Subject Teacher 20 Min Det (SUBTEA20M)' },
    session: { type: 'string', example: 'AS' },
    times: { type: 'string', example: '15:10 - 16:10' },
    subject: { type: 'string', example: 'History' },
    teacher: { type: 'string', example: 'Mr D Horne' },
    room: { type: 'string', example: '220' },
    attended: { type: 'boolean', example: true },
    comment: { type: 'string', example: 'Incomplete homework' },
  },
};

const ClassInfoSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', example: '7A/Hi' },
    subject: { type: 'string', example: 'History' },
    teacher: { type: 'string', example: 'Mr D Horne' },
  },
};

const TimetableLessonSchema = {
  type: 'object',
  nullable: true,
  properties: {
    subject: { type: 'string', example: 'History' },
    classCode: { type: 'string', example: '7A/Hi' },
    teacher: { type: 'string', example: 'Mr D Horne' },
  },
};

const TimetablePeriodSchema = {
  type: 'object',
  properties: {
    period: { type: 'string', example: '3', description: 'AM | 1–5 | AS' },
    monday: TimetableLessonSchema,
    tuesday: TimetableLessonSchema,
    wednesday: TimetableLessonSchema,
    thursday: TimetableLessonSchema,
    friday: TimetableLessonSchema,
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const mcasRoutes: FastifyPluginAsync<RoutesOptions> = async (app, options) => {
  const { credentialProvider } = options;
  const siteId = MCAS_CONFIG.siteId;

  // ── GET /attendance/today ──────────────────────────────────────────────────
  app.get('/attendance/today', {
    schema: {
      tags: ['mcas'],
      summary: "Today's AM and PM attendance register marks",
      description: `
Returns today's AM and PM registration marks for both Samuel and Emmanuel.

This is the **fastest MCAS endpoint** — it calls the MCAS dashboard attendance
widget API directly without any page navigation, making it suitable for frequent
polling (every few minutes).

**Attendance status values**

| Value | Meaning |
|-------|---------|
| \`Present\` | Student was marked present |
| \`AuthorisedAbsent\` | Authorised absence |
| \`UnauthorisedAbsent\` | Unauthorised absence |
| \`Late\` | Student arrived late |
| \`NotTaken\` | Register not yet taken |
| \`NotRequired\` | Not a school session |
| \`Unknown\` | Unrecognised mark |

**Data source:** MCAS API proxy → \`GetAttendanceWidgetData/{studentId}/-1\`

**Typical response time:** 3–8 seconds (+ ~10 s first-call login)

\`\`\`bash
curl http://localhost:3000/api/mcas/attendance/today
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'mcas' },
            fetchedAt: { type: 'string', format: 'date-time' },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Samuel' },
                  studentId: { type: 'integer', example: 10732 },
                  am: AttendanceMarkSchema,
                  pm: AttendanceMarkSchema,
                },
              },
            },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
    try {
      const result = await getTodayAttendance(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError("Failed to retrieve today's attendance.");
    }
  });

  // ── GET /classes ───────────────────────────────────────────────────────────
  app.get('/classes', {
    schema: {
      tags: ['mcas'],
      summary: 'Class list and current week timetable for each child',
      description: `
Returns the full list of enrolled classes and the current week's timetable for
both Samuel and Emmanuel.

**This data changes rarely** (at most once per term when class allocations change),
so callers are encouraged to cache the result and only refresh infrequently.

**Timetable periods**

| Period | Meaning |
|--------|---------|
| \`AM\` | Morning tutor registration |
| \`1\`–\`5\` | Lesson periods |
| \`AS\` | After school (detentions / activities) |

**Data sources**
- Class list: MCAS API proxy → \`GetClassListWidgetData/{studentId}\`
- Timetable: page scrape of \`/MCAS/MCSTimetable.aspx\` (requires child context switch)

**Typical response time:** 30–50 seconds

\`\`\`bash
curl http://localhost:3000/api/mcas/classes
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'mcas' },
            fetchedAt: { type: 'string', format: 'date-time' },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Samuel' },
                  studentId: { type: 'integer', example: 10732 },
                  classes: {
                    type: 'array',
                    description: 'All enrolled classes for this student',
                    items: ClassInfoSchema,
                  },
                  timetable: {
                    type: 'object',
                    properties: {
                      weekCommencing: {
                        type: 'string',
                        format: 'date',
                        example: '2026-03-02',
                        description: 'ISO date for Monday of the displayed week',
                      },
                      periods: {
                        type: 'array',
                        items: TimetablePeriodSchema,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
    try {
      const result = await getClasses(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve classes and timetable.');
    }
  });

  // ── GET /weekly-summary ────────────────────────────────────────────────────
  app.get('/weekly-summary', {
    schema: {
      tags: ['mcas'],
      summary: 'Last 7 days of attendance, behaviour events, and detentions',
      description: `
Returns a 7-day window of school data for both Samuel and Emmanuel, covering:

- **Attendance** — one mark per calendar day (last 7 days) from the attendance calendar
- **Behaviour** — all positive and negative events for each weekday in the window
- **Detentions** — all detentions with full details (subject, teacher, room, attended, comment)

This is designed for an AI agent that tracks patterns over time.  The agent should
call this endpoint periodically (e.g. once a day) and accumulate the results.

**Attendance status values**

| Value | Meaning |
|-------|---------|
| \`Present\` | Marked present |
| \`AuthorisedAbsent\` | Authorised absence |
| \`UnauthorisedAbsent\` | Unauthorised absence |
| \`Late\` | Arrived late |
| \`NotTaken\` | Register not yet recorded |
| \`NotRequired\` | Weekend or school holiday |

**Behaviour type values:** \`positive\` | \`negative\`

**Data sources**
- Attendance: page scrape of \`/MCAS/MCSAttendanceReports.aspx\` (child context switch per student)
- Behaviour: MCAS API proxy → \`eventRecords/mcas/eventstable/{id}/{yearId}/{y}/{m}/{d}/-1\` (one call per weekday per student)
- Detentions: MCAS API proxy → \`detentions/mcas/{studentId}\` (full list filtered to window)

**Typical response time:** 60–90 seconds

\`\`\`bash
curl http://localhost:3000/api/mcas/weekly-summary
\`\`\`
`.trim(),
      response: {
        200: {
          type: 'object',
          properties: {
            site: { type: 'string', example: 'mcas' },
            fetchedAt: { type: 'string', format: 'date-time' },
            weekFrom: { type: 'string', format: 'date', example: '2026-02-24' },
            weekTo: { type: 'string', format: 'date', example: '2026-03-03' },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Samuel' },
                  studentId: { type: 'integer', example: 10732 },
                  attendance: {
                    type: 'array',
                    description: 'One entry per calendar day in the 7-day window',
                    items: DailyAttendanceSchema,
                  },
                  behaviour: {
                    type: 'array',
                    description: 'All behaviour events in the window',
                    items: BehaviourEventSchema,
                  },
                  detentions: {
                    type: 'array',
                    description: 'Detentions in the window',
                    items: DetentionSchema,
                  },
                },
              },
            },
          },
        },
        500: ErrorSchema,
      },
    },
  }, async (_req, reply) => {
    try {
      const result = await getWeeklySummary(credentialProvider);
      return { site: siteId, ...result };
    } catch (err) {
      app.log.error(err);
      return reply.internalServerError('Failed to retrieve weekly summary.');
    }
  });
};
