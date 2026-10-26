import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["chromium", "firefox"];
for (const target of targets) {
  const dir = path.join(root, "dist", target);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.description.length <= 132, `${target} description exceeds 132 characters`);
  assert.deepEqual(manifest.host_permissions, [
    "https://boeing.continuitylogic.com/*",
    "https://us-gov-rest-prd-formbuilder.continuitylogic.com/*"
  ]);
  for (const file of ["popup.html", "popup.css", "popup.js", "service_worker.js", "content_script.js", "content_script.css", "core/validation.js", "core/postApproval.js", "checkpoints/index.js", "checkpoints/ERPS32.js"]) {
    assert.ok(fs.existsSync(path.join(dir, file)), `${target} is missing ${file}`);
  }
  const shipped = ["manifest.json", "popup.html", "popup.js", "service_worker.js", "content_script.js", "content_script.css", "core/validation.js", "core/postApproval.js", "checkpoints/index.js"]
    .map(file => fs.readFileSync(path.join(dir, file), "utf8")).join("\n");
  for (const forbidden of ["eval(", "new Function(", "connectionToken=", "x-xsrf-token", "@boeing.com", ".har\""]) {
    assert.ok(!shipped.includes(forbidden), `${target} contains forbidden text: ${forbidden}`);
  }
}

const chromium = JSON.parse(fs.readFileSync(path.join(root, "dist", "chromium", "manifest.json"), "utf8"));
assert.equal(chromium.background.service_worker, "service_worker.js");
assert.equal(chromium.side_panel.default_path, "popup.html?view=side-panel");
assert.ok(chromium.permissions.includes("sidePanel"));
assert.equal(chromium.action.default_popup, undefined);
assert.equal(chromium.minimum_chrome_version, "116");
assert.deepEqual(chromium.content_scripts[0].matches, ["https://boeing.continuitylogic.com/*"]);
assert.deepEqual(chromium.web_accessible_resources, [{
  resources: ["popup.html"],
  matches: ["https://boeing.continuitylogic.com/*"]
}]);

const firefox = JSON.parse(fs.readFileSync(path.join(root, "dist", "firefox", "manifest.json"), "utf8"));
assert.deepEqual(firefox.background.scripts, ["service_worker.js"]);
assert.equal(firefox.sidebar_action.default_panel, "popup.html?view=sidebar");
assert.equal(firefox.sidebar_action.open_at_install, true);
assert.equal(firefox.action.default_popup, undefined);
assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, "142.0");
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
assert.ok(!firefox.permissions.includes("sidePanel"));

const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
for (const contract of [
  "OrientationDate8341",
  "TableTopExerciseDate8336",
  "DrillDate8337",
  "FunctionalExerciseDate8338",
  "Recovery on Dev; Test or Pre-Production",
  "Manual Failover Recovery",
  'putUrl.searchParams.set("parentformid", "0")',
  "updatePlanValidationDates"
]) assert.ok(worker.includes(contract), `Post-approval parent update contract is missing: ${contract}`);
for (const contract of ["openPanelOnActionClick", "sidebarAction.toggle()"] ) {
  assert.ok(worker.includes(contract), `Default side-pane contract is missing: ${contract}`);
}
for (const contract of ["GET_POST_APPROVAL_STATUS", "postApprovalStatus"] ) {
  assert.ok(worker.includes(contract), `ERPS page action contract is missing: ${contract}`);
}
for (const contract of ["RUN_POST_APPROVAL_PROCESS", "pagesFetched", "POST_PROCESS_DESCRIPTIONS"]) {
  assert.ok(worker.includes(contract), `Post-DR background process contract is missing: ${contract}`);
}
for (const contract of ["CAPTURE_WORKFLOW_INITIATOR", "GET_WORKFLOW_INITIATOR", "recordWorkflowAudit", "/User/GetUser"]) {
  assert.ok(worker.includes(contract), `Workflow initiator contract is missing: ${contract}`);
}
assert.ok(!worker.includes("OPEN_POST_APPROVAL_PANEL"), "ERPS DR Plugin must not route to the browser side pane");

const checkpointFiles = fs.readdirSync(path.join(root, "checkpoints")).filter(file => /^ERPS\d+\.js$/.test(file));
assert.equal(checkpointFiles.length, 32, "Exactly 32 modular ERPS checkpoint files are required");
for (let id = 1; id <= 32; id += 1) {
  assert.ok(checkpointFiles.includes(`ERPS${id}.js`), `Missing checkpoints/ERPS${id}.js`);
  const checkpointSource = fs.readFileSync(path.join(root, "checkpoints", `ERPS${id}.js`), "utf8");
  assert.ok(checkpointSource.includes(`id: "ERPS${id}"`), `ERPS${id}.js exports the wrong checkpoint ID`);
  assert.ok(checkpointSource.includes("validate("), `ERPS${id}.js has no validate function`);
}

const contentScript = fs.readFileSync(path.join(root, "content_script.js"), "utf8");
for (const contract of [
  "formentrycontainer1500_ENTITY_",
  "Complete Post-DR Process",
  "GET_POST_APPROVAL_STATUS",
  "DR Plugin",
  "popup.html",
  "view\", \"embedded",
  "drpa-erps-main-page",
  "CAPTURE_WORKFLOW_INITIATOR"
]) assert.ok(contentScript.includes(contract), `ERPS page button contract is missing: ${contract}`);
for (const contract of ["reportSelectionArea", "drpa-post-modal", "RUN_POST_APPROVAL_PROCESS"]) {
  assert.ok(contentScript.includes(contract), `ERPS modal post-process contract is missing: ${contract}`);
}
assert.ok(!contentScript.includes("sidePanel.open"), "ERPS DR Plugin must render inside the ERPS main content area");

const packageScript = fs.readFileSync(path.join(root, "scripts", "package.ps1"), "utf8");
assert.ok(!packageScript.includes('Join-Path $workspaceRoot "artifacts"'), "Exported packages must not use artifacts/");

const automationSource = fs.readFileSync(path.join(root, "core", "postApproval.js"), "utf8");
assert.ok(!automationSource.includes("Functional Test Validation"), "Functional validation must not appear in post-approval automation");
assert.ok(!worker.includes("Functional Test Validation"), "Service worker must reject Functional validation automation");

const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const popupCss = fs.readFileSync(path.join(root, "popup.css"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "popup.html contains duplicate IDs");
const referencedIds = [...popupJs.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
const missingIds = [...new Set(referencedIds.filter(id => !ids.includes(id)))];
assert.deepEqual(missingIds, [], `popup.js references missing IDs: ${missingIds.join(", ")}`);

for (const contract of [
  'class="app"',
  'class="header"',
  "prerequisites-card",
  "assessment-list",
  "btn-primary",
  "result-tabs"
]) assert.ok(html.includes(contract), `SCMP UI shell contract is missing: ${contract}`);

for (const contract of [
  "--primary: #0c1427",
  "width: 650px",
  "border-radius: 18px",
  "body.side-pane .app"
]) assert.ok(popupCss.includes(contract), `SCMP visual contract is missing: ${contract}`);

for (const script of ["scripts/package.ps1", "scripts/sign-firefox.ps1"]) {
  assert.ok(fs.existsSync(path.join(root, script)), `Missing Firefox packaging script: ${script}`);
}

console.log("Generated extension packages passed static contract checks.");
