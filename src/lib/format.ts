export function fmtDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return null;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtReadMinutes(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0 || !Number.isFinite(minutes)) return null;
  return `~${Math.round(minutes)} мин`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  if (d.getTime() >= startToday.getTime()) {
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

export function groupByPeriod<T extends { createdAt: string }>(list: T[]): {
  label: string;
  items: T[];
}[] {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dow = (now.getDay() + 6) % 7; // 0 = понедельник
  const startWeek = startToday - dow * 86400000;
  const today: T[] = [];
  const week: T[] = [];
  const earlier: T[] = [];
  for (const b of list) {
    const t = new Date(b.createdAt || 0).getTime();
    if (t >= startToday) today.push(b);
    else if (t >= startWeek) week.push(b);
    else earlier.push(b);
  }
  const groups: { label: string; items: T[] }[] = [];
  if (today.length) groups.push({ label: "Сегодня", items: today });
  if (week.length) groups.push({ label: "На этой неделе", items: week });
  if (earlier.length) groups.push({ label: "Раньше", items: earlier });
  return groups;
}