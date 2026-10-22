export function clean(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function normalize(value) {
  return clean(value).toLowerCase();
}

export function parseLookup(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

export function personId(person) {
  return clean(person?.Id || person?.BEMSID2122 || person?.WorkEmail615).toLowerCase();
}

export function people(value) {
  return parseLookup(value).map(person => ({
    id: personId(person),
    entityId: clean(person?.Id),
    status: clean(person?.EmployeeStatus7331),
    raw: person
  })).filter(person => person.id);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function applicationRecord(component) {
  return parseLookup(component?.Application8408)[0] || {};
}

export function applicationName(component) {
  const app = applicationRecord(component);
  return clean(app.ApplicationName1620 || component?.PlanName8555);
}

export function applicationId(component) {
  const app = applicationRecord(component);
  return clean(app.ApplicationID1622 || component?.AppID8556);
}

export function recoveryLevel(component) {
  const value = clean(applicationRecord(component)?.RecoveryLevelRL7343);
  const match = value.match(/RL\s*([1-5])/i);
  return match ? Number(match[1]) : null;
}

export function numeric(value) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function sameDate(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) &&
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

export function includesAll(text, values) {
  const haystack = normalize(text);
  return values.filter(Boolean).every(value => haystack.includes(normalize(value)));
}

export function validationType(value) {
  const normalized = normalize(value);
  if (normalized.includes("orientation")) return "orientation";
  if (normalized.includes("table top") || normalized.includes("tabletop")) return "tabletop";
  if (normalized.includes("drill")) return "drill";
  if (normalized.includes("functional")) return "functional";
  return "";
}

export function result(id, status, reason, evidence = []) {
  return { id, status, reason, evidence };
}
