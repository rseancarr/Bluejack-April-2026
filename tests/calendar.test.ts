import { describe, expect, it } from "vitest";
import { cleanAgenda, meetingsBetween } from "../lib/calendar/outlook";
import { dayBounds, dateKey, shiftDate, zonedMidnight } from "../lib/calendar/day";

const ICS = `BEGIN:VCALENDAR
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
VERSION:2.0
X-WR-CALNAME:Sean Calendar
BEGIN:VTIMEZONE
TZID:Pacific Standard Time
BEGIN:STANDARD
DTSTART:16011104T020000
RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010311T020000
RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:one
DTSTART;TZID=Pacific Standard Time:20260908T090000
DTEND;TZID=Pacific Standard Time:20260908T093000
SUMMARY:Axis — David call
LOCATION:Microsoft Teams Meeting
ORGANIZER;CN=Sean Carr:mailto:scarr@example.com
ATTENDEE;CN=David Smith;ROLE=REQ-PARTICIPANT:mailto:david@example.com
ATTENDEE;CN=AJ Lake;ROLE=REQ-PARTICIPANT:mailto:aj@example.com
DESCRIPTION:Agenda:\\n1. Q3 update\\n2. Follow-on sizing\\n\\n________________________________________________________________________________\\nMicrosoft Teams meeting\\nJoin on your computer\\nClick here to join the meeting<https://teams.microsoft.com/l/meetup-join/abc>\\nMeeting ID: 123 456\\nPasscode: xyz
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART;TZID=Pacific Standard Time:20260901T140000
DTEND;TZID=Pacific Standard Time:20260901T150000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Pacific Standard Time:20260915T140000
SUMMARY:Weekly pipeline review
END:VEVENT
BEGIN:VEVENT
UID:allday
DTSTART;VALUE=DATE:20260908
DTEND;VALUE=DATE:20260909
SUMMARY:Teddy OOO
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART;TZID=Pacific Standard Time:20260908T160000
DTEND;TZID=Pacific Standard Time:20260908T163000
STATUS:CANCELLED
SUMMARY:Cancelled thing
END:VEVENT
BEGIN:VEVENT
UID:other-day
DTSTART;TZID=Pacific Standard Time:20260909T090000
DTEND;TZID=Pacific Standard Time:20260909T093000
SUMMARY:Tomorrow only
END:VEVENT
END:VCALENDAR
`;

const TZ = "America/Los_Angeles";

describe("day helpers", () => {
  it("finds local midnight in the team zone, across DST", () => {
    expect(zonedMidnight("2026-09-08", TZ).toISOString()).toBe("2026-09-08T07:00:00.000Z"); // PDT
    expect(zonedMidnight("2026-12-08", TZ).toISOString()).toBe("2026-12-08T08:00:00.000Z"); // PST
    const b = dayBounds("2026-11-01", TZ); // DST ends this day: 25 hours long
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(25);
    expect(dateKey(new Date("2026-09-09T05:30:00Z"), TZ)).toBe("2026-09-08");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("published Outlook calendar", () => {
  const { start, end } = dayBounds("2026-09-08", TZ);
  const day = meetingsBetween(ICS, start, end);

  it("lists the day's meetings in order, all-day first, cancelled dropped, other days excluded", () => {
    expect(day.map((m) => m.title)).toEqual(["Teddy OOO", "Axis — David call", "Weekly pipeline review"]);
    expect(day[0].allDay).toBe(true);
  });

  it("converts Windows time-zone names and keeps invitees, organizer and video type", () => {
    const call = day[1];
    expect(call.start.toISOString()).toBe("2026-09-08T16:00:00.000Z"); // 9:00 PDT
    expect(call.video).toBe("Teams");
    expect(call.location).toBeNull(); // the Teams placeholder is not a room
    expect(call.organizer).toBe("Sean Carr");
    expect(call.attendees).toEqual(["David Smith", "AJ Lake"]);
    expect(call.agenda).toBe("Agenda:\n1. Q3 update\n2. Follow-on sizing");
  });

  it("expands recurring series and honours exceptions", () => {
    expect(day[2].recurring).toBe(true);
    expect(day[2].start.toISOString()).toBe("2026-09-08T21:00:00.000Z");
    const skipped = dayBounds("2026-09-15", TZ);
    expect(meetingsBetween(ICS, skipped.start, skipped.end).map((m) => m.title)).toEqual([]);
    const later = dayBounds("2026-09-22", TZ);
    expect(meetingsBetween(ICS, later.start, later.end).map((m) => m.title)).toEqual(["Weekly pipeline review"]);
  });

  it("strips join-link boilerplate from invite text", () => {
    expect(cleanAgenda("Discuss budget\r\n\r\nJoin Zoom Meeting\r\nhttps://zoom.us/j/1\r\nMeeting ID: 1")).toBe("Discuss budget");
    expect(cleanAgenda("")).toBe("");
    expect(cleanAgenda(undefined)).toBe("");
  });
});
