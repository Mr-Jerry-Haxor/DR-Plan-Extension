import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const researchDirectories = [root, path.join(root, "research data")];
const reference = researchDirectories
  .map(directory => path.join(directory, "DR Plan reference boeing.continuitylogic.com.har"))
  .find(candidate => fs.existsSync(candidate));
if (!reference) {
  console.log("HAR verification skipped: research HAR fixtures are not present.");
  process.exit(0);
}

const har = JSON.parse(fs.readFileSync(reference, "utf8"));
const entries = har?.log?.entries || [];
assert.ok(entries.length > 0, "Reference HAR has no entries");

function json(entry) {
  try { return JSON.parse(entry?.response?.content?.text || "null"); } catch { return null; }
}

function requestJson(entry) {
  try { return JSON.parse(entry?.request?.postData?.text || "null"); } catch { return null; }
}

function fields(value, output = new Map()) {
  if (!value || typeof value !== "object") return output;
  if (!Array.isArray(value) && value.FieldName) output.set(value.FieldName, value);
  for (const child of Object.values(value)) fields(child, output);
  return output;
}

function canonicalDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : "";
}

const rootEntry = entries.find(entry => {
  try {
    const url = new URL(entry.request.url);
    return entry.request.method === "GET" && url.pathname === "/api/formviewer" &&
      url.searchParams.get("formid") === "1500" && Number(json(entry)?.EntityId) > 0;
  } catch { return false; }
});
assert.ok(rootEntry, "HAR does not contain an IT Plan entity request");
const rootResponse = json(rootEntry);
const planRows = JSON.parse(rootResponse.FormDataJson);
const plan = Array.isArray(planRows) ? planRows[0] : planRows;
for (const field of [
  "PlanName7870", "PlanOwner17919", "PlanApprovers7920", "Purpose7948", "Scope7921",
  "Assumptions7949", "RecoveryStrategies7950", "ActivationCriteria7951", "ActivationProcedure7952",
  "ETTRGRT9587", "PlanRevisionLetter8342", "RevisionDescription8343"
]) assert.ok(field in plan, `IT Plan field missing from HAR: ${field}`);

const planPageEntry = entries.find(entry => {
  try {
    const url = new URL(entry.request.url);
    return url.hostname === "boeing.continuitylogic.com" && url.pathname === "/Form/_FormEntryKO" &&
      url.searchParams.get("formid") === "1500" && url.searchParams.get("mode") === "view";
  } catch { return false; }
});
assert.ok(planPageEntry, "HAR does not contain an ERPS IT Plan page response");
const planPageHtml = planPageEntry.response.content.text || "";
assert.ok(planPageHtml.includes("formentrycontainer1500_ENTITY_"), "IT Plan page container contract changed");
assert.ok(planPageHtml.includes('class="widgetHeader"'), "IT Plan widget header contract changed");
assert.ok(planPageHtml.includes("mobileEllipsisButtons"), "IT Plan action toolbar contract changed");
const shellEntry = entries.find(entry => {
  try { const url = new URL(entry.request.url); return url.hostname === "boeing.continuitylogic.com" && url.pathname === "/"; } catch { return false; }
});
const shellHtml = shellEntry?.response?.content?.text || "";
assert.ok(shellHtml.includes('id="left-panel"'), "ERPS sidebar container contract changed");
assert.ok(shellHtml.includes('id="profile-alert"'), "ERPS profile sidebar contract changed");
assert.ok(shellHtml.includes('class="side-nav-menu"'), "ERPS sidebar menu contract changed");
assert.ok(shellHtml.includes('id="content"'), "ERPS main content workspace contract changed");

const formIds = new Set(entries.map(entry => json(entry)?.Id).filter(Boolean));
for (const id of [1500, 1504, 1522, 1524, 1526, 1530, 1544, 1545, 1546, 1550]) {
  assert.ok(formIds.has(id), `Expected DR Plan form ${id} is absent from the HAR`);
}

const fixtureDirectory = path.dirname(reference);
const postFiles = fs.readdirSync(fixtureDirectory).filter(name => name.includes("Post approval") && name.endsWith(".har"));
assert.ok(postFiles.length >= 3, "Expected three post-approval HAR examples");
for (const file of postFiles) {
  const postHar = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, file), "utf8"));
  const hasNewEntity = postHar.log.entries.some(entry => {
    try {
      const url = new URL(entry.request.url);
      return entry.request.method === "GET" && url.pathname === "/api/form" &&
        url.searchParams.get("withNewEntityId") === "true" && url.searchParams.get("formId") === "1610";
    } catch { return false; }
  });
  const hasSave = postHar.log.entries.some(entry => {
    try {
      const url = new URL(entry.request.url);
      const body = JSON.parse(entry.request.postData?.text || "null");
      return entry.request.method === "PUT" && url.pathname === "/api/formviewer" && body?.Id === 1610;
    } catch { return false; }
  });
  assert.ok(hasNewEntity && hasSave, `${file} lacks the expected create/save contract`);

  const planEntry = postHar.log.entries.find(entry => {
    try {
      const url = new URL(entry.request.url);
      return entry.request.method === "GET" && url.pathname === "/api/formviewer" &&
        url.searchParams.get("formid") === "1500" && Number(json(entry)?.EntityId) > 0;
    } catch { return false; }
  });
  const planRows = JSON.parse(json(planEntry).FormDataJson);
  const postPlan = Array.isArray(planRows) ? planRows[0] : planRows;
  const approvalDate = canonicalDate(postPlan.PlanApprovalDate8330);
  const saves = new Map();
  for (const entry of postHar.log.entries) {
    let url;
    try { url = new URL(entry.request.url); } catch { continue; }
    const body = requestJson(entry);
    if (entry.request.method !== "PUT" || url.pathname !== "/api/formviewer" || body?.Id !== 1610) continue;
    saves.set(body.EntityId, fields(body));
  }
  const savedTypes = [...saves.values()].map(map => map.get("TestExerciseType9526")?.Value);
  assert.deepEqual(new Set(savedTypes), new Set(["Orientation Validation", "Table Top Validation", "Drill Validation"]), `${file} does not contain the expected RL2 record types`);
  const allowedStrategies = new Set([
    "Automatic Failover Recovery",
    "Manual Failover Recovery",
    "Recovery Failover on Dedicated; Shared Recovery Environment",
    "Recovery on Dev; Test or Pre-Production",
    "Recovery on Replacement Equipment"
  ]);
  for (const map of saves.values()) {
    assert.equal(canonicalDate(map.get("TestExerciseDate9527")?.Value), approvalDate, `${file} validation date differs from Plan Approval Date`);
    assert.ok(allowedStrategies.has(map.get("RecoveryStrategiesDiscussedTested9535")?.Value), `${file} uses an unexpected recovery strategy option`);
  }

}

const fastDocFile = postFiles.find(name => name.includes("FAST-Doc"));
assert.ok(fastDocFile, "FAST-Doc post-approval HAR is missing");
const fastDocHar = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, fastDocFile), "utf8"));
const planDateSave = fastDocHar.log.entries.find(entry => {
  try {
    const url = new URL(entry.request.url);
    const body = JSON.parse(entry.request.postData?.text || "null");
    return entry.request.method === "PUT" && url.pathname === "/api/formviewer" &&
      url.searchParams.get("parentformid") === "0" && body?.Id === 1500;
  } catch { return false; }
});
assert.ok(planDateSave, "FAST-Doc HAR lacks the parent IT Plan date synchronization save");
const planDateBody = JSON.parse(planDateSave.request.postData.text);
const fieldValues = new Map([...fields(planDateBody)].map(([name, field]) => [name, field.Value]));
for (const field of ["OrientationDate8341", "TableTopExerciseDate8336", "DrillDate8337"]) {
  assert.ok(fieldValues.get(field), `Parent IT Plan save does not populate ${field}`);
}

console.log("HAR contracts verified without exporting captured values.");
