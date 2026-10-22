import {
  applicationName,
  applicationRecord,
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
} from "./data.js";

export const CHECKPOINTS = [
  ["ERPS1", "Plan dates match Recovery Plan Validations"],
  ["ERPS2", "Plan revision letter is incremented"],
  ["ERPS3", "Current revision description is documented"],
  ["ERPS4", "Organization matches an ESATS maintaining organization"],
  ["ERPS5", "Plan Owner matches Plan Approver"],
  ["ERPS6", "Purpose includes applications and data centers"],
  ["ERPS7", "Scope includes applications, locations, inclusions, and exclusions"],
  ["ERPS8", "Assumptions are present and consistent"],
  ["ERPS9", "Recovery strategy is consistent with scope"],
  ["ERPS10", "Plan and component recovery strategies agree"],
  ["ERPS11", "ERP is populated and non-zero when data is recovered"],
  ["ERPS12", "Activation criteria includes application and data center"],
  ["ERPS13", "Activation procedure identifies recovery-team contact"],
  ["ERPS14", "Application plan has no top-level infrastructure components"],
  ["ERPS15", "Component ETTR equals task timeline"],
  ["ERPS16", "Linked servers match historical GSEP evidence"],
  ["ERPS17", "Linked databases were active in GSEP"],
  ["ERPS18", "Linked applications were active in ESATS and complete"],
  ["ERPS19", "Recovery Team has a leader and backup or member"],
  ["ERPS20", "Recovery Team roles are unique"],
  ["ERPS21", "Named employees were active at approval"],
  ["ERPS22", "General tasks start at zero and end in recovery"],
  ["ERPS23", "General task time arithmetic is correct"],
  ["ERPS24", "A task assembles the Recovery Team"],
  ["ERPS25", "ITOC/MIM activation references have matching tasks"],
  ["ERPS26", "Recovery strategy is consistent with tasks"],
  ["ERPS27", "Earlier certification findings are addressed"],
  ["ERPS28", "Orientation validation exists for every application"],
  ["ERPS29", "Tabletop validation exists when required"],
  ["ERPS30", "Drill validation exists when required"],
  ["ERPS31", "Functional validation exists for RL4/RL5"],
  ["ERPS32", "Orientation participants match Recovery Team" ]
].map(([id, title]) => ({ id, title }));

const PASS = "PASS";
const FAIL = "FAIL";
const REVIEW = "REVIEW";
const NA = "NA";

function appNames(context) {
  return context.applicationComponents.map(applicationName).filter(Boolean);
}

function dataCenterPresent(value) {
  return /data\s*cent(?:er|re)|region|availability\s+zone|\b(?:quincy|phoenix|charlotte)\b/i.test(clean(value));
}

function latestValidation(context, component, kind) {
  return context.validations
    .filter(row => validationType(row.TestExerciseType9526) === kind)
    .filter(row => String(row.ApplicationTestedExercised9582) === String(component.Id))
    .sort((a, b) => Date.parse(b.TestExerciseDate9527 || 0) - Date.parse(a.TestExerciseDate9527 || 0))[0];
}

function memberRows(context) {
  return context.recoveryTeamMembers || [];
}

function allRecoveryPeople(context) {
  return unique(memberRows(context).flatMap(row => people(row.Members8349).map(person => person.id)));
}

function strategyKeywords(value) {
  const normalized = normalize(value);
  const keys = [];
  if (/replacement|rebuild|recover.+server/.test(normalized)) keys.push("replacement");
  if (/failover/.test(normalized)) keys.push("failover");
  if (/backup|back-up|restore.+data/.test(normalized)) keys.push("backup");
  if (/manual/.test(normalized)) keys.push("manual");
  if (/automatic/.test(normalized)) keys.push("automatic");
  return keys;
}

function externalReview(id, label, rows) {
  const inactive = rows.some(row => applicationRecord(row).IsActive === false);
  return inactive
    ? result(id, FAIL, `${label} contains an inactive embedded master record.`)
    : result(id, REVIEW, `${label} is present in ERPS, but approval-date external-system evidence was not retrieved.`);
}

function validate(context) {
  const plan = context.plan || {};
  const apps = context.applicationComponents || [];
  const names = appNames(context);
  const tasks = [...(context.recoveryTasks || [])].sort((a, b) => numeric(a.Sequence9446) - numeric(b.Sequence9446));
  const findings = [];
  const push = (id, status, reason, evidence = []) => findings.push(result(id, status, reason, evidence));

  const dateMap = { orientation: plan.OrientationDate8341, tabletop: plan.TableTopExerciseDate8336, drill: plan.DrillDate8337, functional: plan.FunctionalExerciseDate8338 };
  const mismatches = [];
  const missingEvidence = [];
  for (const [kind, headerDate] of Object.entries(dateMap)) {
    const applicable = kind === "functional"
      ? apps.filter(component => [4, 5].includes(recoveryLevel(component)))
      : kind === "tabletop" || kind === "drill"
        ? apps.filter(component => ![4, 5].includes(recoveryLevel(component)))
        : apps;
    for (const component of applicable) {
      const row = latestValidation(context, component, kind);
      if (!headerDate) mismatches.push(`${kind} header date: ${applicationName(component)}`);
      else if (!row) missingEvidence.push(`${kind}: ${applicationName(component)}`);
      else if (!sameDate(headerDate, row.TestExerciseDate9527)) mismatches.push(`${kind}: ${applicationName(component)}`);
    }
  }
  push(
    "ERPS1",
    mismatches.length ? FAIL : missingEvidence.length ? REVIEW : PASS,
    mismatches.length
      ? `Blank or mismatched validation dates were found for ${mismatches.join(", ")}.`
      : missingEvidence.length
        ? `Detailed validation evidence was not retrieved for ${missingEvidence.join(", ")}.`
        : "Header dates match the captured validation records."
  );

  push("ERPS2", REVIEW, `Current revision is ${clean(plan.PlanRevisionLetter8342) || "blank"}; the previously approved plan version was not retrieved.`);
  const letter = clean(plan.PlanRevisionLetter8342);
  push("ERPS3", letter && new RegExp(`(?:rev(?:ision)?\\s*)${letter}\\b`, "i").test(clean(plan.RevisionDescription8343)) ? PASS : FAIL, letter ? "Current revision is identified in the revision description." : "Plan revision letter is blank.");
  push("ERPS4", REVIEW, "ESATS maintaining-organization evidence is not available in the ERPS response.");

  const owners = unique([plan.PlanOwner17919, plan.PlanOwner28505].flatMap(value => people(value).map(person => person.id)));
  const approvers = unique(people(plan.PlanApprovers7920).map(person => person.id));
  push("ERPS5", owners.length && approvers.length && owners.some(id => approvers.includes(id)) ? PASS : FAIL, owners.some(id => approvers.includes(id)) ? "A Plan Owner exactly matches a Plan Approver." : "No exact Plan Owner and Plan Approver match was found.");

  const purposeOk = names.length > 0 && includesAll(plan.Purpose7948, names) && dataCenterPresent(plan.Purpose7948);
  push("ERPS6", purposeOk ? PASS : FAIL, purposeOk ? "Purpose includes every application and a data-center or geographic location." : "Purpose is missing an application name or data-center/geographic location.");
  const scope = clean(plan.Scope7921);
  const scopeOk = names.length > 0 && includesAll(scope, names) && dataCenterPresent(scope) && /includ/i.test(scope) && /exclud/i.test(scope);
  push("ERPS7", scopeOk ? PASS : FAIL, scopeOk ? "Scope contains applications, location, inclusions, and exclusions." : "Scope is missing one or more required elements.");

  const assumptions = clean(plan.Assumptions7949);
  push("ERPS8", !assumptions ? FAIL : /\bREMT\b/i.test(assumptions) ? FAIL : REVIEW, !assumptions ? "No assumptions are documented." : /\bREMT\b/i.test(assumptions) ? "REMT is listed as an assumption." : "Assumptions are present and REMT is absent; consistency with every procedure needs semantic review.");
  const planStrategy = clean(plan.RecoveryStrategies7950);
  push("ERPS9", !planStrategy || !scope ? FAIL : REVIEW, !planStrategy || !scope ? "Scope or recovery strategy is blank." : "Scope and recovery strategy are documented; semantic consistency requires reviewer confirmation.");

  const componentMismatch = apps.some(component => {
    const rootKeys = strategyKeywords(planStrategy);
    const componentKeys = strategyKeywords(component.Strategy9558);
    return rootKeys.length && componentKeys.length && !rootKeys.some(key => componentKeys.includes(key));
  });
  push("ERPS10", componentMismatch ? FAIL : PASS, componentMismatch ? "A component strategy conflicts with the plan strategy." : "No conflict was found between plan and component strategies.");

  const recoversData = /data|backup|back-up|database|restore/i.test(planStrategy);
  const badErp = apps.filter(component => numeric(component.ERP9557) === null || (recoversData && numeric(component.ERP9557) <= 0));
  push("ERPS11", badErp.length ? FAIL : PASS, badErp.length ? "ERP is blank/invalid, or zero while data recovery is documented." : "ERP is populated and non-zero where data recovery is documented.");

  const criteriaOk = names.length && includesAll(plan.ActivationCriteria7951, names) && dataCenterPresent(plan.ActivationCriteria7951);
  push("ERPS12", criteriaOk ? PASS : FAIL, criteriaOk ? "Activation criteria includes applications and a recovery location." : "Activation criteria is missing an application or recovery location.");
  const procedure = clean(plan.ActivationProcedure7952);
  const mentionsTeam = /recovery team|initial call list/i.test(procedure);
  const identifiesActor = /(?:plan owner|team lead(?:er)?|ITOC|MIM|manager|coordinator|consultant|author)\b.{0,40}\b(?:contact|notify|call|assemble)/i.test(procedure);
  push("ERPS13", mentionsTeam && identifiesActor ? PASS : FAIL, !mentionsTeam ? "Activation procedure does not contact the Recovery Team or Initial Call List." : !identifiesActor ? "Activation procedure does not identify who contacts the Recovery Team." : "Activation procedure identifies the contact path and responsible actor.");

  const infrastructureCount = context.itServices.length + context.databases.length + context.hardware.length + context.servers.length;
  push("ERPS14", infrastructureCount === 0 ? PASS : FAIL, infrastructureCount === 0 ? "Application plan has no top-level IT Service, Database, Hardware, or Server records." : `${infrastructureCount} prohibited top-level infrastructure record(s) were found.`);

  const maxGeneral = Math.max(0, ...tasks.map(task => numeric(task.CumulativeHours8547) || 0));
  const ettrMismatch = apps.some(component => {
    const linked = context.linkedByComponent?.[component.Id]?.recoveryTasks || [];
    const timeline = linked.length ? Math.max(0, ...linked.map(task => numeric(task.CumulativeHours8682) || 0)) : maxGeneral;
    return numeric(component.ETTR9556) !== timeline;
  });
  push("ERPS15", ettrMismatch ? FAIL : PASS, ettrMismatch ? "A component ETTR does not equal its applicable task timeline." : "Component ETTR values equal the applicable task timeline.");

  const linkedServers = apps.flatMap(component => context.linkedByComponent?.[component.Id]?.servers || []);
  const linkedDatabases = apps.flatMap(component => context.linkedByComponent?.[component.Id]?.databases || []);
  const linkedApps = apps.flatMap(component => context.linkedByComponent?.[component.Id]?.applications || []);
  push("ERPS16", REVIEW, `${linkedServers.length} linked server(s) were retrieved; historical GSEP completeness and status still require authoritative evidence.`);
  push("ERPS17", REVIEW, `${linkedDatabases.length} linked database(s) were retrieved; approval-date GSEP status still requires authoritative evidence.`);
  const incompleteApps = linkedApps.filter(row => !clean(row.Application8657) || !clean(row.AppID8696));
  push("ERPS18", incompleteApps.length ? FAIL : REVIEW, incompleteApps.length ? `${incompleteApps.length} linked application row(s) contain blank required data.` : `${linkedApps.length} linked application(s) are complete in ERPS; approval-date ESATS status still requires authoritative evidence.`);

  const roles = memberRows(context).map(row => normalize(row.RolePosition8347));
  const leaders = roles.filter(role => /team leader$/.test(role)).length;
  const backups = roles.filter(role => /backup/.test(role)).length;
  const members = roles.filter(role => /team member/.test(role)).length;
  push("ERPS19", leaders === 1 && backups + members >= 1 ? PASS : FAIL, leaders === 1 && backups + members >= 1 ? "One Team Leader and at least one backup/member are populated." : "Recovery Team leadership or backup/member coverage is incomplete.");
  const rolePeople = memberRows(context).flatMap(row => people(row.Members8349).map(person => [person.id, normalize(row.RolePosition8347)]));
  const byPerson = new Map();
  for (const [id, role] of rolePeople) byPerson.set(id, new Set([...(byPerson.get(id) || []), role]));
  const duplicated = [...byPerson.values()].some(roleSet => roleSet.size > 1);
  push("ERPS20", leaders === 1 && backups <= 1 && !duplicated ? PASS : FAIL, leaders === 1 && backups <= 1 && !duplicated ? "Leadership roles are unique and each person has one role." : "Duplicate leadership or multi-role membership was found.");
  const inactiveMembers = memberRows(context).flatMap(row => people(row.Members8349)).filter(person => normalize(person.status) && normalize(person.status) !== "active");
  push("ERPS21", inactiveMembers.length ? FAIL : REVIEW, inactiveMembers.length ? `${inactiveMembers.length} team member(s) are not active in the embedded snapshot.` : "Embedded member snapshots are active; approval-date employee status requires historical evidence.");

  const startsAtZero = numeric(tasks[0]?.StartHours8364) === 0;
  const endsRecovered = /recover(?:ed|y)|resume.+production|available/i.test(clean(tasks.at(-1)?.TaskCategory8362) + " " + clean(tasks.at(-1)?.Description8363));
  push("ERPS22", startsAtZero && endsRecovered ? PASS : FAIL, startsAtZero && endsRecovered ? "Tasks start at zero and end with application/system recovery." : "Task timeline does not start at zero or end with recovery.");
  const mathErrors = tasks.filter(task => {
    const start = numeric(task.StartHours8364), duration = numeric(task.Duration8365), cumulative = numeric(task.CumulativeHours8547);
    return start === null || duration === null || cumulative === null || Math.abs(start + duration - cumulative) > 0.001;
  });
  push("ERPS23", mathErrors.length ? FAIL : PASS, mathErrors.length ? `${mathErrors.length} task row(s) have incorrect start + duration arithmetic.` : "Start plus duration equals cumulative time for every task.");
  push("ERPS24", tasks.some(task => /(?:assemble|gather|contact).{0,30}recovery team|recovery team.{0,30}(?:assemble|gather|contact)/i.test(clean(task.TaskCategory8362) + " " + clean(task.Description8363))) ? PASS : FAIL, tasks.some(task => /(?:assemble|gather|contact).{0,30}recovery team|recovery team.{0,30}(?:assemble|gather|contact)/i.test(clean(task.TaskCategory8362) + " " + clean(task.Description8363))) ? "A Recovery Team assembly task exists." : "No Recovery Team assembly task was found.");

  const activationRefs = ["ITOC", "MIM"].filter(term => new RegExp(`\\b${term}\\b`, "i").test(procedure));
  const taskText = tasks.map(task => `${clean(task.TaskCategory8362)} ${clean(task.Description8363)}`).join(" ");
  push("ERPS25", !activationRefs.length ? NA : activationRefs.every(term => new RegExp(`\\b${term}\\b`, "i").test(taskText)) ? PASS : FAIL, !activationRefs.length ? "ITOC and MIM are not referenced in the activation procedure." : "Activation references were compared with the recovery tasks.");

  const taskKeys = strategyKeywords(taskText);
  const strategyKeys = strategyKeywords(planStrategy);
  const contradiction = strategyKeys.includes("automatic") && taskKeys.includes("replacement");
  push("ERPS26", contradiction ? FAIL : PASS, contradiction ? "Automatic failover conflicts with replacement-equipment tasks." : "No deterministic conflict was found between recovery strategy and tasks.");
  push("ERPS27", REVIEW, `${context.nonPrintableDocuments.length} non-printable document record(s) were retrieved, but certification findings and document contents require review.`);

  const validationCheck = (id, kind, applicable) => {
    if (!applicable.length) return push(id, NA, `${kind} validation is not applicable to these recovery levels.`);
    const missing = applicable.filter(component => {
      const row = latestValidation(context, component, kind);
      return !row || clean(row.TestScenarioDescription9534).length < 10;
    });
    push(id, missing.length ? FAIL : PASS, missing.length ? `${kind} validation with descriptive text is missing for: ${missing.map(applicationName).join(", ")}.` : `${kind} validation with descriptive text exists for every applicable application.`);
  };
  validationCheck("ERPS28", "orientation", apps);
  validationCheck("ERPS29", "tabletop", apps.filter(component => ![4, 5].includes(recoveryLevel(component))));
  validationCheck("ERPS30", "drill", apps.filter(component => ![4, 5].includes(recoveryLevel(component))));
  const functionalApps = apps.filter(component => [4, 5].includes(recoveryLevel(component)));
  if (!functionalApps.length) {
    push("ERPS31", NA, "Functional validation is not applicable because no application is RL4 or RL5.");
  } else {
    const missingOrStale = functionalApps.filter(component => {
      const row = latestValidation(context, component, "functional");
      const timestamp = Date.parse(row?.TestExerciseDate9527 || "");
      return !row || clean(row.TestScenarioDescription9534).length < 10 || Number.isNaN(timestamp) || Date.now() - timestamp > 366 * 24 * 60 * 60 * 1000;
    });
    push("ERPS31", missingOrStale.length ? NA : PASS, missingOrStale.length ? `Functional validation is missing or not current for: ${missingOrStale.map(applicationName).join(", ")}.` : "A current Functional validation exists for every RL4/RL5 application.");
  }

  const recoveryIds = allRecoveryPeople(context);
  const orientationRows = context.validations.filter(row => validationType(row.TestExerciseType9526) === "orientation");
  if (!orientationRows.length) {
    push("ERPS32", REVIEW, "No Orientation validation participants were retrieved.");
  } else {
    const mismatched = orientationRows.some(row => {
      const ids = unique(people(row.Participants9530).map(person => person.id));
      return ids.length !== recoveryIds.length || ids.some(id => !recoveryIds.includes(id));
    });
    push("ERPS32", mismatched ? FAIL : PASS, mismatched ? "Orientation participants do not exactly match Recovery Team members." : "Orientation participants exactly match Recovery Team members.");
  }

  return findings;
}

export function runValidation(context) {
  const results = validate(context);
  const counts = Object.fromEntries([PASS, FAIL, REVIEW, NA].map(status => [status, results.filter(item => item.status === status).length]));
  return {
    planId: context.plan?.Id,
    planName: clean(context.plan?.PlanName7870),
    generatedAt: new Date().toISOString(),
    results: CHECKPOINTS.map(checkpoint => ({
      ...checkpoint,
      ...(results.find(item => item.id === checkpoint.id) || result(checkpoint.id, REVIEW, "Checkpoint did not produce a result."))
    })),
    summary: { total: CHECKPOINTS.length, ...counts }
  };
}
