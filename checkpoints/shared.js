import {
  applicationName,
  clean,
  includesAll,
  normalize,
  numeric,
  people,
  recoveryLevel,
  result,
  sameDate,
  unique,
  validationType
} from "../core/data.js";

export { applicationName, clean, includesAll, normalize, numeric, people, recoveryLevel, sameDate, unique, validationType };
export const PASS = "PASS";
export const FAIL = "FAIL";
export const REVIEW = "REVIEW";
export const NA = "NA";

export function finding(id, status, reason, evidence = []) {
  return result(id, status, reason, evidence);
}

export function plan(context) { return context.plan || {}; }
export function apps(context) { return context.applicationComponents || []; }
export function appNames(context) { return apps(context).map(applicationName).filter(Boolean); }
export function memberRows(context) { return context.recoveryTeamMembers || []; }
export function tasks(context) {
  return [...(context.recoveryTasks || [])].sort((a, b) => numeric(a.Sequence9446) - numeric(b.Sequence9446));
}
export function dataCenterPresent(value) {
  return /data\s*cent(?:er|re)|region|availability\s+zone|\b(?:quincy|phoenix|charlotte)\b/i.test(clean(value));
}
export function latestValidation(context, component, kind) {
  return (context.validations || [])
    .filter(row => validationType(row.TestExerciseType9526) === kind)
    .filter(row => String(row.ApplicationTestedExercised9582) === String(component.Id))
    .sort((a, b) => Date.parse(b.TestExerciseDate9527 || 0) - Date.parse(a.TestExerciseDate9527 || 0))[0];
}
export function allRecoveryPeople(context) {
  return unique(memberRows(context).flatMap(row => people(row.Members8349).map(person => person.id)));
}
export function strategyKeywords(value) {
  const valueNormalized = normalize(value);
  const keys = [];
  if (/replacement|rebuild|recover.+server/.test(valueNormalized)) keys.push("replacement");
  if (/failover/.test(valueNormalized)) keys.push("failover");
  if (/backup|back-up|restore.+data/.test(valueNormalized)) keys.push("backup");
  if (/manual/.test(valueNormalized)) keys.push("manual");
  if (/automatic/.test(valueNormalized)) keys.push("automatic");
  return keys;
}
export function linkedRows(context, key) {
  return apps(context).flatMap(component => context.linkedByComponent?.[component.Id]?.[key] || []);
}
export function validateExercise(context, id, kind, applicable) {
  if (!applicable.length) return finding(id, NA, `${kind} validation is not applicable to these recovery levels.`);
  const missing = applicable.filter(component => {
    const row = latestValidation(context, component, kind);
    return !row || clean(row.TestScenarioDescription9534).length < 10;
  });
  return finding(
    id,
    missing.length ? FAIL : PASS,
    missing.length
      ? `${kind} validation with descriptive text is missing for: ${missing.map(applicationName).join(", ")}.`
      : `${kind} validation with descriptive text exists for every applicable application.`
  );
}
