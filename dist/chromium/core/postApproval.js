import {
  applicationId,
  applicationName,
  clean,
  recoveryLevel,
  validationType
} from "./data.js";

export const PROCESS_MATRIX = Object.freeze({
  1: { orientation: "required", tabletop: "required", drill: "optional", functional: "not-required" },
  2: { orientation: "required", tabletop: "required", drill: "required", functional: "not-required" },
  3: { orientation: "twice-yearly", tabletop: "required", drill: "required", functional: "not-required" },
  4: { orientation: "twice-yearly", tabletop: "not-required", drill: "optional", functional: "required" },
  5: { orientation: "twice-yearly", tabletop: "not-required", drill: "optional", functional: "required" }
});

export const VALIDATION_TYPES = Object.freeze({
  orientation: "Orientation Validation",
  tabletop: "Table Top Validation",
  drill: "Drill Validation",
  functional: "Functional Test Validation"
});

export const PLAN_DATE_FIELDS = Object.freeze({
  orientation: "OrientationDate8341",
  tabletop: "TableTopExerciseDate8336",
  drill: "DrillDate8337",
  functional: "FunctionalExerciseDate8338"
});

const DESCRIPTIONS = Object.freeze({
  orientation: "Orientation email sent to recovery team participants listed in the DR plan to save the plan in local desktop for future reference.",
  tabletop: "All members of the recovery team are familiar with the documented recovery tasks and also verified that these tasks can be executed as outlined and will lead to the successful recovery of the asset.",
  drill: "During the review, the recovery team examined the recovery team list, plan strategy, and activation criteria. At this time, no issues have been identified.",
  functional: "The recovery team completed a functional recovery exercise and verified the documented recovery procedure for the application."
});

function isoToErpsDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${month}/${day}/${year}` : "";
}

function addMonthsToErpsDate(value, months) {
  const [month, day, year] = String(value || "").split("/").map(Number);
  if (!month || !day || !year) return "";
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return `${String(target.getUTCMonth() + 1).padStart(2, "0")}/${String(target.getUTCDate()).padStart(2, "0")}/${target.getUTCFullYear()}`;
}

export function erpsDateToIso(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "";
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

export function defaultPostApprovalDate(plan, fallbackIsoDate) {
  return erpsDateToIso(plan?.PlanApprovalDate8330) || fallbackIsoDate;
}

export function planDateUpdates(items) {
  const updates = {};
  for (const item of items || []) {
    const fieldName = PLAN_DATE_FIELDS[item.kind || validationType(item.type)];
    if (fieldName && item.date) updates[fieldName] = item.date;
  }
  return updates;
}

export function matrixForLevel(level) {
  return PROCESS_MATRIX[Number(level)] || null;
}

export function buildPostApprovalItems(context, isoDate) {
  const date = isoToErpsDate(isoDate);
  return (context.applicationComponents || []).flatMap(component => {
    const level = recoveryLevel(component);
    const matrix = matrixForLevel(level);
    if (!matrix) {
      return [{
        key: `${component.Id}:unknown`,
        componentId: Number(component.Id),
        applicationId: applicationId(component),
        applicationName: applicationName(component),
        level: null,
        kind: "unknown",
        requirement: "review",
        type: "",
        date,
        description: "Recovery level is unavailable; no record can be prepared safely.",
        selected: false
      }];
    }
    return Object.entries(matrix).map(([kind, requirement]) => ({
      key: `${component.Id}:${kind}`,
      componentId: Number(component.Id),
      applicationId: applicationId(component),
      applicationName: applicationName(component),
      level,
      kind,
      requirement,
      type: VALIDATION_TYPES[kind],
      date,
      nextDueDate: requirement === "twice-yearly"
        ? addMonthsToErpsDate(date, 6)
        : requirement === "required"
          ? addMonthsToErpsDate(date, 12)
          : "",
      description: DESCRIPTIONS[kind],
      selected: requirement === "required" || requirement === "twice-yearly"
    }));
  });
}

export function validateCreationItem(item, component) {
  const errors = [];
  const level = recoveryLevel(component);
  const kind = validationType(item?.type);
  const requirement = matrixForLevel(level)?.[kind];
  if (!component || Number(component.Id) !== Number(item?.componentId)) errors.push("Application component does not belong to this plan.");
  if (!kind || !VALIDATION_TYPES[kind]) errors.push("Unsupported validation type.");
  if (!requirement || requirement === "not-required") errors.push("This validation type is not applicable to the recovery level.");
  const dateMatch = clean(item?.date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const parsedDate = dateMatch
    ? new Date(Date.UTC(Number(dateMatch[3]), Number(dateMatch[1]) - 1, Number(dateMatch[2])))
    : null;
  if (!dateMatch || parsedDate.getUTCFullYear() !== Number(dateMatch[3]) || parsedDate.getUTCMonth() !== Number(dateMatch[1]) - 1 || parsedDate.getUTCDate() !== Number(dateMatch[2])) {
    errors.push("Date must be a valid MM/DD/YYYY date.");
  }
  const description = clean(item?.description);
  if (description.length < 20 || description.length > 2000) errors.push("Description must contain 20 to 2,000 characters.");
  return errors;
}
