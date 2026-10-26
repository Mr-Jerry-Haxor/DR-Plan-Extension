import { runValidation } from "./core/validation.js";
import { buildPostApprovalItems, defaultPostApprovalDate, validateCreationItem } from "./core/postApproval.js";

const extensionApi = globalThis.browser || globalThis.chrome;
const state = {
  plans: [],
  planCatalogMeta: { total: 0, pagesFetched: 0, truncated: false },
  planPage: 1,
  planPageSize: 100,
  visiblePlans: [],
  filteredPlans: [],
  selectedPlanIds: new Set(),
  selectedPlanId: null,
  contexts: new Map(),
  reports: [],
  context: null,
  report: null,
  automationItems: [],
  filter: "ALL"
};

const $ = id => document.getElementById(id);

function node(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "checked") element.checked = Boolean(value);
    else if (key === "disabled") element.disabled = Boolean(value);
    else if (key.startsWith("data-")) element.setAttribute(key, value);
    else element[key] = value;
  }
  for (const child of children) element.append(child);
  return element;
}

function request(type, payload = {}) {
  const message = {
    version: 1,
    type,
    requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    payload
  };
  const responsePromise = globalThis.browser
    ? extensionApi.runtime.sendMessage(message)
    : new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, response => {
        const lastError = extensionApi.runtime.lastError;
        if (lastError) reject(new Error(lastError.message));
        else resolve(response);
      });
    });
  return responsePromise.then(response => {
    if (!response?.ok) {
      const error = new Error(response?.error?.message || "Extension request failed.");
      if (response?.error?.details) error.details = response.error.details;
      throw error;
    }
    return response.data;
  });
}

function storageSet(value) {
  return globalThis.browser
    ? extensionApi.storage.local.set(value)
    : new Promise((resolve, reject) => extensionApi.storage.local.set(value, () => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve();
    }));
}

function storageGet(keys) {
  return globalThis.browser
    ? extensionApi.storage.local.get(keys)
    : new Promise((resolve, reject) => extensionApi.storage.local.get(keys, value => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(value || {});
    }));
}

function storageRemove(keys) {
  return globalThis.browser
    ? extensionApi.storage.local.remove(keys)
    : new Promise((resolve, reject) => extensionApi.storage.local.remove(keys, () => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve();
    }));
}

function setBusy(busy, message = "Working…") {
  $("busyMessage").textContent = message;
  $("busyOverlay").classList.toggle("hidden", !busy);
  document.querySelectorAll("button").forEach(button => { button.disabled = busy || button.dataset.baseDisabled === "true"; });
  if (!busy) {
    $("validateBtn").disabled = state.selectedPlanIds.size === 0;
    const pageCount = Math.max(1, Math.ceil(state.filteredPlans.length / state.planPageSize));
    $("previousPlanPageBtn").disabled = state.planPage <= 1;
    $("nextPlanPageBtn").disabled = state.planPage >= pageCount;
  }
}

function setMessage(element, message, type = "") {
  element.textContent = message;
  const baseClass = element.id === "sessionMessage" ? "prereq-summary" : "message";
  element.className = `${baseClass}${type ? ` ${type}` : ""}`;
}

async function checkSession() {
  setBusy(true, "Checking ERPS session…");
  try {
    const status = await request("CHECK_SESSION");
    $("sessionBadge").textContent = status.authenticated ? "ERPS connected" : "Sign-in required";
    $("sessionBadge").className = `badge ${status.authenticated ? "pass" : "fail"}`;
    $("sessionSignal").className = `signal ${status.authenticated ? "signal-ok" : "signal-fail"}`;
    setMessage($("sessionMessage"), status.authenticated ? "Authenticated ERPS session detected." : "Open ERPS and sign in.", status.authenticated ? "success" : "error");
  } catch (error) {
    $("sessionBadge").textContent = "Sign-in required";
    $("sessionBadge").className = "badge fail";
    $("sessionSignal").className = "signal signal-fail";
    setMessage($("sessionMessage"), error.message, "error");
  } finally {
    setBusy(false);
  }
}

function normalizedDate(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filteredPlans() {
  const query = $("planSearch").value.trim().toLowerCase();
  const status = $("planStatusFilter").value;
  const organization = $("organizationFilter").value;
  const from = $("approvalFromDate").value ? new Date(`${$("approvalFromDate").value}T00:00:00`) : null;
  const to = $("approvalToDate").value ? new Date(`${$("approvalToDate").value}T23:59:59`) : null;
  return state.plans.filter(plan => {
    const text = `${plan.id} ${plan.name} ${plan.longName} ${plan.organization} ${plan.approverName}`.toLowerCase();
    const date = normalizedDate(plan.approvalDate);
    return (!query || text.includes(query)) &&
      (!status || plan.status.toLowerCase() === status) &&
      (!organization || plan.organization === organization) &&
      (!from || (date && date >= from)) &&
      (!to || (date && date <= to));
  });
}

function populateOrganizationFilter() {
  const select = $("organizationFilter");
  const selected = select.value;
  const organizations = [...new Set(state.plans.map(plan => plan.organization).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  select.replaceChildren(node("option", { value: "", text: "All Organizations" }));
  organizations.forEach(organization => select.append(node("option", { value: organization, text: organization })));
  if (organizations.includes(selected)) select.value = selected;
}

function updateSelectionState() {
  const count = state.selectedPlanIds.size;
  $("planSelectionCount").textContent = `${count} selected`;
  $("validateBtn").disabled = count === 0;
}

function renderPlans() {
  state.filteredPlans = filteredPlans();
  const pageCount = Math.max(1, Math.ceil(state.filteredPlans.length / state.planPageSize));
  state.planPage = Math.min(Math.max(1, state.planPage), pageCount);
  const offset = (state.planPage - 1) * state.planPageSize;
  state.visiblePlans = state.filteredPlans.slice(offset, offset + state.planPageSize);
  const list = $("planList");
  list.replaceChildren();
  for (const plan of state.visiblePlans) {
    const input = node("input", { type: "checkbox", value: String(plan.id), checked: state.selectedPlanIds.has(plan.id) });
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPlanIds.add(plan.id);
      else state.selectedPlanIds.delete(plan.id);
      state.selectedPlanId = state.selectedPlanIds.size === 1 ? [...state.selectedPlanIds][0] : null;
      updateSelectionState();
    });
    const metadata = [plan.status, plan.approverName && `Approver: ${plan.approverName}`, plan.approvalDate && `Last approved: ${plan.approvalDate}`, plan.revision && `Rev ${plan.revision}`].filter(Boolean).join(" • ");
    const statusClass = plan.status.toLowerCase().replace(/\s+/g, "-");
    const label = node("label", { className: "plan-option assessment-row" }, [
      input,
      node("div", { className: "assessment-meta" }, [
        node("div", { className: "asset-name" }, [
          node("span", { text: plan.name }),
          node("span", { className: `status ${statusClass}`, text: plan.status || "Unknown" })
        ]),
        node("div", { className: "asset-sub", text: `${plan.id}${plan.longName ? ` • ${plan.longName}` : ""}` }),
        node("div", { className: "asset-sub status-detail", text: metadata })
      ])
    ]);
    list.append(label);
  }
  if (!state.filteredPlans.length) list.append(node("p", { className: "message", text: "No DR Plans match the active filters." }));
  const pagination = state.planCatalogMeta.pagesFetched ? ` Loaded in ${state.planCatalogMeta.pagesFetched} request page(s).` : "";
  $("planCount").textContent = `${state.filteredPlans.length} of ${state.plans.length} accessible plan(s) match filters.${pagination}`;
  $("planPageLabel").textContent = `Page ${state.planPage} of ${pageCount}`;
  $("previousPlanPageBtn").disabled = state.planPage <= 1;
  $("nextPlanPageBtn").disabled = state.planPage >= pageCount;
  updateSelectionState();
}

async function loadPlans(force = false, search = "", loadAll = pageView === "embedded") {
  const query = String(search || "").trim();
  if (!loadAll && !query) {
    state.plans = [];
    state.filteredPlans = [];
    renderPlans();
    $("planCount").textContent = "Enter an application name or plan ID to search accessible DR Plans.";
    return;
  }
  if (state.plans.length && !force && loadAll) return renderPlans();
  setBusy(true, loadAll ? "Loading accessible DR Plans…" : "Searching accessible DR Plans…");
  try {
    const rows = [];
    let start = 0;
    let total = 0;
    let pagesFetched = 0;
    do {
      const page = await request("LIST_PLANS_PAGE", { start, length: 100, search: query });
      total = Number(page.total) || 0;
      pagesFetched += 1;
      rows.push(...page.rows);
      start += 100;
      $("busyMessage").textContent = loadAll
        ? "Loaded " + Math.min(rows.length, total) + " of " + total + " accessible DR Plans…"
        : "Loaded " + rows.length + " matching DR Plan(s)…";
      if (!loadAll || !page.rows.length) break;
    } while (start < total);
    state.plans = rows;
    state.planCatalogMeta = { total, pagesFetched, truncated: rows.length < total };
    populateOrganizationFilter();
    renderPlans();
    if (rows.length < total) setMessage($("sessionMessage"), rows.length + " of " + total + " plans loaded.", "error");
  } catch (error) {
    setMessage($("sessionMessage"), error.message, "error");
  } finally {
    setBusy(false);
  }
}

function renderSummary() {
  const summary = $("summary");
  summary.replaceChildren();
  for (const status of ["PASS", "FAIL", "REVIEW", "NA"]) {
    const total = state.reports.reduce((sum, report) => sum + Number(report.summary[status] || 0), 0);
    summary.append(node("div", { className: `summary-item ${status.toLowerCase()}` }, [
      node("strong", { text: String(total) }),
      node("span", { text: status === "NA" ? "N/A" : status })
    ]));
  }
}

function renderResults() {
  const list = $("resultList");
  list.replaceChildren();
  for (const report of state.reports) {
    const results = report.results.filter(item => state.filter === "ALL" || item.status === state.filter);
    if (!results.length) continue;
    const group = node("section", { className: "plan-result-group" }, [
      node("h3", { className: "plan-result-title", text: `${report.planName} • Plan ${report.planId}` })
    ]);
    for (const item of results) {
      group.append(node("article", { className: `result ${item.status.toLowerCase()}` }, [
        node("div", { className: "result-header" }, [
          node("h3", { text: `${item.id} — ${item.title}` }),
          node("span", { className: `status ${item.status.toLowerCase()}`, text: item.status === "NA" ? "N/A" : item.status })
        ]),
        node("p", { text: item.reason })
      ]));
    }
    list.append(group);
  }
}

function localIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderAutomation() {
  const list = $("automationList");
  list.replaceChildren();
  for (const item of state.automationItems) {
    const checkbox = node("input", {
      type: "checkbox",
      checked: item.selected,
      disabled: item.requirement === "not-required" || item.requirement === "review",
      ariaLabel: `Select ${item.type || item.kind} for ${item.applicationName}`
    });
    checkbox.dataset.key = item.key;
    const textarea = node("textarea", {
      value: item.description,
      maxLength: 2000,
      disabled: item.requirement === "not-required" || item.requirement === "review",
      ariaLabel: `Description for ${item.type || item.kind} ${item.applicationName}`
    });
    textarea.dataset.key = item.key;
    list.append(node("article", { className: "automation-item" }, [
      node("div", { className: "automation-title" }, [
        checkbox,
        node("div", {}, [
          node("strong", { text: item.type || "Recovery level review required" }),
          node("span", { text: `${item.planName} • ${item.applicationName || "Unknown application"} • ${item.level ? `RL${item.level}` : "RL unknown"} • Date ${item.date}${item.nextDueDate ? ` • Next due ${item.nextDueDate}` : ""}` })
        ]),
        node("span", { className: "requirement", text: item.requirement.replace("-", " ") })
      ]),
      textarea
    ]));
  }
}

async function validateSelected() {
  const planIds = [...state.selectedPlanIds];
  if (!planIds.length) return;
  setBusy(true, `Loading and validating ${planIds.length} DR Plan(s)…`);
  try {
    state.contexts = new Map();
    state.reports = [];
    for (let index = 0; index < planIds.length; index += 1) {
      const planId = planIds[index];
      $("busyMessage").textContent = `Loading DR Plan ${index + 1} of ${planIds.length}…`;
      const context = await request("LOAD_PLAN", { planId });
      try {
        context.esatsEvidence = await request("GET_ESATS_EVIDENCE", { planId });
      } catch (error) {
        context.esatsEvidence = { applications: [], error: error.message };
      }
      const report = runValidation(context);
      state.contexts.set(planId, context);
      state.reports.push(report);
    }
    state.selectedPlanId = planIds.length === 1 ? planIds[0] : null;
    state.context = state.selectedPlanId ? state.contexts.get(state.selectedPlanId) : null;
    state.report = state.reports[0] || null;
    await storageSet({ lastValidations: state.reports });
    $("selectedPlanLabel").textContent = `${state.reports.length} DR Plan(s) validated`;
    renderSummary();
    renderResults();
    state.automationItems = [];
    for (const [planId, context] of state.contexts) {
      if (String(context.plan.PlanApprovalStatus8334 || "").trim().toLowerCase() !== "approved") continue;
      const date = defaultPostApprovalDate(context.plan, localIsoDate());
      state.automationItems.push(...buildPostApprovalItems(context, date).map(item => ({
        ...item,
        key: `${planId}:${item.key}`,
        planId,
        planName: context.plan.PlanName7870
      })));
    }
    const singlePlan = state.contexts.size === 1;
    $("validationDateField").classList.toggle("hidden", !singlePlan);
    if (singlePlan) {
      const onlyContext = [...state.contexts.values()][0];
      $("validationDate").value = defaultPostApprovalDate(onlyContext.plan, localIsoDate());
    }
    renderAutomation();
    const canAutomate = state.automationItems.length > 0;
    $("createBtn").dataset.baseDisabled = canAutomate ? "false" : "true";
    $("createBtn").disabled = !canAutomate;
    setMessage(
      $("createMessage"),
      canAutomate ? "No records are created until you select and confirm them." : "No selected Approved plan has applicable post-approval automation.",
      canAutomate ? "" : "error"
    );
    $("resultsSection").classList.remove("hidden");
    $("automationSection").classList.remove("hidden");
    $("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setMessage($("sessionMessage"), error.message, "error");
  } finally {
    setBusy(false);
  }
}

function selectedCreationItems() {
  const singlePlan = state.contexts.size === 1;
  const dateValue = $("validationDate").value;
  const [year, month, day] = dateValue.split("-");
  const singlePlanDate = year && month && day ? `${month}/${day}/${year}` : "";
  return state.automationItems.filter(item => {
    const checkbox = document.querySelector(`input[type="checkbox"][data-key="${CSS.escape(item.key)}"]`);
    return checkbox?.checked;
  }).map(item => {
    const textarea = document.querySelector(`textarea[data-key="${CSS.escape(item.key)}"]`);
    return { ...item, date: singlePlan ? singlePlanDate : item.date, description: textarea?.value || "" };
  });
}

async function createSelected() {
  const items = selectedCreationItems();
  if (!items.length) return setMessage($("createMessage"), "Select at least one applicable validation record.", "error");
  const errors = items.flatMap(item => {
    const context = state.contexts.get(Number(item.planId));
    const component = context?.applicationComponents.find(row => Number(row.Id) === Number(item.componentId));
    return validateCreationItem(item, component).map(message => `${item.planName} / ${item.applicationName} / ${item.type}: ${message}`);
  });
  if (errors.length) return setMessage($("createMessage"), errors.join(" "), "error");
  const summary = items.map(item => `${item.planName} / ${item.applicationName}: ${item.type} on ${item.date}`).join("\n");
  if (!window.confirm(`Synchronize the selected IT Plan header dates and create ${items.length} ERPS validation record(s)?\n\n${summary}\n\nThis writes to ERPS and cannot be undone by the extension.`)) return;
  setBusy(true, "Creating confirmed ERPS validation records…");
  try {
    const grouped = new Map();
    for (const item of items) {
      const group = grouped.get(item.planId) || [];
      group.push(item);
      grouped.set(item.planId, group);
    }
    let createdCount = 0;
    let skippedCount = 0;
    const initiators = new Set();
    for (const [planId, planItems] of grouped) {
      const result = await request("CREATE_VALIDATIONS", {
        planId,
        items: planItems.map(({ componentId, type, date, description }) => ({ componentId, type, date, description }))
      });
      createdCount += result.created.length;
      skippedCount += result.skipped.length;
      const initiator = result.workflowAudit?.initiatedBy;
      if (initiator) initiators.add(`${initiator.displayName} (${initiator.userId})`);
    }
    const initiatedBy = initiators.size ? ` Initiated by ${[...initiators].join(", ")}.` : "";
    const successMessage = `${createdCount} record(s) created; ${skippedCount} duplicate(s) skipped.${initiatedBy}`;
    renderPlans();
    await validateSelected();
    setMessage($("createMessage"), successMessage, "success");
  } catch (error) {
    const partial = error.details?.created?.length
      ? ` ${error.details.created.length} record(s) were confirmed before the failure.`
      : "";
    setMessage($("createMessage"), `${error.message}${partial} Check ERPS before retrying; the workflow is idempotent and will skip confirmed duplicates.`, "error");
  } finally {
    setBusy(false);
  }
}

$("checkSessionBtn").addEventListener("click", checkSession);
$("refreshPlansBtn").addEventListener("click", () => loadPlans(true, $("planSearch").value, pageView === "embedded"));
function applyPlanFilters() { state.planPage = 1; renderPlans(); }
$("searchForm").addEventListener("submit", event => {
  event.preventDefault();
  if (pageView === "embedded") applyPlanFilters();
  else loadPlans(true, $("planSearch").value, false);
});
$("planSearch").addEventListener("input", () => { if (pageView === "embedded") applyPlanFilters(); });
$("planStatusFilter").addEventListener("change", applyPlanFilters);
$("organizationFilter").addEventListener("change", applyPlanFilters);
$("approvalFromDate").addEventListener("change", applyPlanFilters);
$("approvalToDate").addEventListener("change", applyPlanFilters);
$("clearPlanFiltersBtn").addEventListener("click", () => {
  $("planSearch").value = "";
  $("planStatusFilter").value = "";
  $("organizationFilter").value = "";
  $("approvalFromDate").value = "";
  $("approvalToDate").value = "";
  applyPlanFilters();
});
$("selectVisiblePlansBtn").addEventListener("click", () => {
  state.visiblePlans.forEach(plan => state.selectedPlanIds.add(plan.id));
  state.selectedPlanId = state.selectedPlanIds.size === 1 ? [...state.selectedPlanIds][0] : null;
  renderPlans();
});
$("previousPlanPageBtn").addEventListener("click", () => { state.planPage -= 1; renderPlans(); });
$("nextPlanPageBtn").addEventListener("click", () => { state.planPage += 1; renderPlans(); });
$("clearPlanSelectionBtn").addEventListener("click", () => {
  state.selectedPlanIds.clear();
  state.selectedPlanId = null;
  renderPlans();
});
$("validateBtn").addEventListener("click", validateSelected);
$("rerunBtn").addEventListener("click", validateSelected);
$("createBtn").addEventListener("click", createSelected);
$("validationDate").addEventListener("change", () => {
  if (state.contexts.size !== 1) return;
  const [planId, context] = [...state.contexts.entries()][0];
  state.automationItems = buildPostApprovalItems(context, $("validationDate").value).map(item => ({
    ...item,
    key: `${planId}:${item.key}`,
    planId,
    planName: context.plan.PlanName7870
  }));
  renderAutomation();
});
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button));
  renderResults();
}));

$("validationDate").value = localIsoDate();
const pageParameters = new URLSearchParams(location.search);
const pageView = pageParameters.get("view");
if (["side-panel", "sidebar", "embedded"].includes(pageView)) {
  document.body.classList.add("side-pane");
}
if (pageView === "embedded") document.body.classList.add("embedded");

let pendingPlanInFlight = false;

async function loadRequestedPlan(planId, requestedView) {
  if (!Number.isSafeInteger(planId) || planId <= 0) return;
  state.selectedPlanIds.clear();
  state.selectedPlanIds.add(planId);
  state.selectedPlanId = planId;
  await loadPlans(false, String(planId), pageView === "embedded");
  await validateSelected();
  if (requestedView === "automation") {
    $("automationSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function consumePendingPlan() {
  if (pendingPlanInFlight) return;
  pendingPlanInFlight = true;
  try {
    const pending = await storageGet(["pendingPlanId", "pendingView"]);
    const planId = Number(pending.pendingPlanId);
    if (!Number.isSafeInteger(planId) || planId <= 0) return;
    await loadRequestedPlan(planId, pending.pendingView);
    await storageRemove(["pendingPlanId", "pendingView"]);
  } catch (error) {
    setMessage($("sessionMessage"), error.message, "error");
  } finally {
    pendingPlanInFlight = false;
  }
}

async function initialize() {
  await checkSession();
  try {
    const initiator = await request("GET_WORKFLOW_INITIATOR");
    $("initiatorLabel").textContent = initiator
      ? `Initiated by: ${initiator.displayName} (${initiator.userId})`
      : "Initiated by: unavailable";
  } catch {
    $("initiatorLabel").textContent = "Initiated by: unavailable";
  }
  const requestedPlanId = Number(pageParameters.get("planId"));
  if (Number.isSafeInteger(requestedPlanId) && requestedPlanId > 0) {
    await loadRequestedPlan(requestedPlanId, pageParameters.get("pendingView"));
    return;
  }
  if (pageView === "embedded") await loadPlans(false);
  await consumePendingPlan();
}

extensionApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Number(changes.pendingPlanId?.newValue) > 0) {
    consumePendingPlan();
  }
});

initialize();
