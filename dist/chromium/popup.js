import { runValidation } from "./core/validation.js";
import { buildPostApprovalItems, defaultPostApprovalDate, validateCreationItem } from "./core/postApproval.js";

const extensionApi = globalThis.browser || globalThis.chrome;
const state = {
  plans: [],
  selectedPlanId: null,
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

function setBusy(busy, message = "Working…") {
  $("busyMessage").textContent = message;
  $("busyOverlay").classList.toggle("hidden", !busy);
  document.querySelectorAll("button").forEach(button => { button.disabled = busy || button.dataset.baseDisabled === "true"; });
  if (!busy) $("validateBtn").disabled = !state.selectedPlanId;
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

function renderPlans(result) {
  state.plans = result.rows;
  const list = $("planList");
  list.replaceChildren();
  for (const plan of state.plans) {
    const input = node("input", { type: "radio", name: "plan", value: String(plan.id), checked: plan.id === state.selectedPlanId });
    input.addEventListener("change", () => {
      state.selectedPlanId = plan.id;
      $("validateBtn").disabled = false;
    });
    const metadata = [plan.status, plan.approvalDate && `Approved ${plan.approvalDate}`, plan.revision && `Rev ${plan.revision}`].filter(Boolean).join(" • ");
    const label = node("label", { className: "plan-option assessment-row" }, [
      input,
      node("div", { className: "assessment-meta" }, [
        node("div", { className: "asset-name", text: plan.name }),
        node("div", { className: "asset-sub", text: `${plan.id}${plan.longName ? ` • ${plan.longName}` : ""}` }),
        node("div", { className: "asset-sub status-detail", text: metadata })
      ])
    ]);
    list.append(label);
  }
  if (!state.plans.length) list.append(node("p", { className: "message", text: "No matching DR Plans were returned." }));
  $("planCount").textContent = `${result.rows.length} of ${result.total} plan(s) loaded${result.truncated ? " — refine the search to see more" : ""}.`;
}

async function loadPlans(search = "") {
  setBusy(true, "Loading DR Plans…");
  try {
    renderPlans(await request("LIST_PLANS", { search }));
  } catch (error) {
    setMessage($("sessionMessage"), error.message, "error");
  } finally {
    setBusy(false);
  }
}

function renderSummary(report) {
  const summary = $("summary");
  summary.replaceChildren();
  for (const status of ["PASS", "FAIL", "REVIEW", "NA"]) {
    summary.append(node("div", { className: `summary-item ${status.toLowerCase()}` }, [
      node("strong", { text: String(report.summary[status]) }),
      node("span", { text: status === "NA" ? "N/A" : status })
    ]));
  }
}

function renderResults() {
  const list = $("resultList");
  list.replaceChildren();
  const results = state.report.results.filter(item => state.filter === "ALL" || item.status === state.filter);
  for (const item of results) {
    list.append(node("article", { className: `result ${item.status.toLowerCase()}` }, [
      node("div", { className: "result-header" }, [
        node("h3", { text: `${item.id} — ${item.title}` }),
        node("span", { className: `status ${item.status.toLowerCase()}`, text: item.status === "NA" ? "N/A" : item.status })
      ]),
      node("p", { text: item.reason })
    ]));
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
          node("span", { text: `${item.applicationName || "Unknown application"} • ${item.level ? `RL${item.level}` : "RL unknown"}${item.nextDueDate ? ` • Next due ${item.nextDueDate}` : ""}` })
        ]),
        node("span", { className: "requirement", text: item.requirement.replace("-", " ") })
      ]),
      textarea
    ]));
  }
}

async function validateSelected() {
  if (!state.selectedPlanId) return;
  setBusy(true, "Loading plan hierarchy and running 32 checkpoints…");
  try {
    state.context = await request("LOAD_PLAN", { planId: state.selectedPlanId });
    state.report = runValidation(state.context);
    await storageSet({ lastValidation: state.report });
    $("selectedPlanLabel").textContent = `${state.report.planName} • Plan ${state.report.planId}`;
    renderSummary(state.report);
    renderResults();
    const date = defaultPostApprovalDate(state.context.plan, $("validationDate").value || localIsoDate());
    $("validationDate").value = date;
    state.automationItems = buildPostApprovalItems(state.context, date);
    renderAutomation();
    const approved = String(state.context.plan.PlanApprovalStatus8334 || "").trim().toLowerCase() === "approved";
    $("createBtn").dataset.baseDisabled = approved ? "false" : "true";
    $("createBtn").disabled = !approved;
    setMessage(
      $("createMessage"),
      approved ? "No records are created until you select and confirm them." : "Post-approval creation is disabled because this plan is not Approved.",
      approved ? "" : "error"
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
  const dateValue = $("validationDate").value;
  const [year, month, day] = dateValue.split("-");
  const erpsDate = year && month && day ? `${month}/${day}/${year}` : "";
  return state.automationItems.filter(item => {
    const checkbox = document.querySelector(`input[type="checkbox"][data-key="${CSS.escape(item.key)}"]`);
    return checkbox?.checked;
  }).map(item => {
    const textarea = document.querySelector(`textarea[data-key="${CSS.escape(item.key)}"]`);
    return { ...item, date: erpsDate, description: textarea?.value || "" };
  });
}

async function createSelected() {
  const items = selectedCreationItems();
  if (!items.length) return setMessage($("createMessage"), "Select at least one applicable validation record.", "error");
  const errors = items.flatMap(item => {
    const component = state.context.applicationComponents.find(row => Number(row.Id) === Number(item.componentId));
    return validateCreationItem(item, component).map(message => `${item.applicationName} / ${item.type}: ${message}`);
  });
  if (errors.length) return setMessage($("createMessage"), errors.join(" "), "error");
  const summary = items.map(item => `${item.applicationName}: ${item.type} on ${item.date}`).join("\n");
  if (!window.confirm(`Synchronize the IT Plan header dates and create ${items.length} ERPS validation record(s)?\n\n${summary}\n\nThis writes to ERPS and cannot be undone by the extension.`)) return;
  setBusy(true, "Creating confirmed ERPS validation records…");
  try {
    const result = await request("CREATE_VALIDATIONS", {
      planId: state.selectedPlanId,
      items: items.map(({ componentId, type, date, description }) => ({ componentId, type, date, description }))
    });
    const headerMessage = result.headerUpdate?.changed
      ? `IT Plan header date fields updated to ${result.headerUpdate.date}. `
      : "IT Plan header dates were already synchronized. ";
    const successMessage = `${headerMessage}${result.created.length} record(s) created; ${result.skipped.length} duplicate(s) skipped.`;
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
$("refreshPlansBtn").addEventListener("click", () => loadPlans($("planSearch").value));
$("searchForm").addEventListener("submit", event => { event.preventDefault(); loadPlans($("planSearch").value); });
$("validateBtn").addEventListener("click", validateSelected);
$("rerunBtn").addEventListener("click", validateSelected);
$("createBtn").addEventListener("click", createSelected);
$("validationDate").addEventListener("change", () => {
  if (!state.context) return;
  state.automationItems = buildPostApprovalItems(state.context, $("validationDate").value);
  renderAutomation();
});
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button));
  renderResults();
}));

$("validationDate").value = localIsoDate();
if (["side-panel", "sidebar"].includes(new URLSearchParams(location.search).get("view"))) {
  document.body.classList.add("side-pane");
}
checkSession();
