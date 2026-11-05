// Helpers for working with the current accounting month (year+month)
export function currentPeriod(d: Date = new Date()) {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function periodLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// First and (exclusive) next-month date in YYYY-MM-DD.
// WHY UTC: callers string-compare these against ISO datetimes from the
// API. Building local-midnight dates and taking toISOString() shifted the
// range by a day in +06 timezones (Dhaka), including the previous month's
// last day and excluding this month's last day. Date.UTC matches
// stats.monthRange and the API's UTC handling. currentPeriod above still
// uses local year/month on purpose — it answers "which month is it here?".
export function periodRange(year: number, month: number) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: fmt(new Date(Date.UTC(year, month - 1, 1))),
    end: fmt(new Date(Date.UTC(year, month, 1))),
  };
}

