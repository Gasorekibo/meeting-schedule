export default function buildFriendlyResponse(employee, calendarData) {
  const { freeSlots, busySlots, events, period, workingHours } = calendarData;

  // 1. Header
  const header = `Hi! You asked to meet ${employee.name}.` +
    `I’m checking the next ${period.days} days ` +
    `( From today: ${period.currentTime} in ${workingHours.timezone}).`;

  return {

    employee: employee,
    message: header,
     busySlots: busySlots.map(b => ({
      start: b.start,
      end: b.end,
      formatted: b.formatted,
      day: b.day,
      date: b.date,
      timeRange: b.timeRange
    })),
    freeSlots: freeSlots.map(s => ({
      start: s.start,
      formatted: s.formatted,
      day: s.day,
      date: s.date,
      time: s.time
    })),
    events: events.map(e => ({
      summary: e.summary,
      start: e.start,
      end: e.end,
      formatted: e.formatted,
      isAllDay: e.isAllDay
    })),
    stats: {
      busySlots: busySlots.length,
      freeSlots: freeSlots.length,
      events: events.length
    }
  };
}