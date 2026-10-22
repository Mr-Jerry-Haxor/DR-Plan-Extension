(function initializeErpsPostApprovalAction() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const CONTAINER_SELECTOR = '[id^="formentrycontainer1500_ENTITY_"]';
  const BUTTON_CLASS = "drpa-post-action";
  const cache = new Map();
  const inFlight = new Map();
  let scanTimer = null;

  function planIdFromContainer(container) {
    const match = String(container?.id || "").match(/^formentrycontainer1500_ENTITY_(\d+)$/);
    const id = Number(match?.[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function request(type, payload = {}) {
    const message = {
      version: 1,
      type,
      requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      payload
    };
    if (globalThis.browser) return extensionApi.runtime.sendMessage(message);
    return new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, response => {
        const error = extensionApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });
    });
  }

  async function postStatus(planId, force = false) {
    const cached = cache.get(planId);
    if (!force && cached && Date.now() - cached.savedAt < 30_000) return cached.value;
    if (inFlight.has(planId)) return inFlight.get(planId);
    const pending = request("GET_POST_APPROVAL_STATUS", { planId })
      .then(response => {
        if (!response?.ok) throw new Error(response?.error?.message || "Unable to evaluate post-approval status.");
        cache.set(planId, { value: response.data, savedAt: Date.now() });
        return response.data;
      })
      .finally(() => inFlight.delete(planId));
    inFlight.set(planId, pending);
    return pending;
  }

  function actionHost(container) {
    return container.querySelector("header.widgetHeader .pull-right.mobileEllipsisButtons") ||
      container.querySelector("header.widgetHeader") || container;
  }

  function removeAction(container) {
    container.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
  }

  async function openWorkflow(button, planId) {
    button.disabled = true;
    const original = button.querySelector(".drpa-post-action__label")?.textContent || "Complete Post-DR Process";
    const label = button.querySelector(".drpa-post-action__label");
    if (label) label.textContent = "Opening side pane…";
    try {
      const response = await request("OPEN_POST_APPROVAL_PANEL", { planId });
      if (!response?.ok) throw new Error(response?.error?.message || "Unable to open the extension side pane.");
      if (!response.data?.opened && label) label.textContent = "Use extension toolbar to continue";
    } catch {
      if (label) label.textContent = "Use extension toolbar to continue";
    } finally {
      button.disabled = false;
      globalThis.setTimeout(() => {
        if (button.isConnected && label) label.textContent = original;
      }, 4_000);
    }
  }

  function createAction(status, planId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.dataset.planId = String(planId);
    button.title = `Open the DR Plan extension to complete ${status.missing.length} missing post-approval requirement(s).`;
    const icon = document.createElement("span");
    icon.className = "drpa-post-action__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    const label = document.createElement("span");
    label.className = "drpa-post-action__label";
    label.textContent = "Complete Post-DR Process";
    const count = document.createElement("span");
    count.className = "drpa-post-action__count";
    count.textContent = String(status.missing.length);
    button.append(icon, label, count);
    button.addEventListener("click", () => openWorkflow(button, planId));
    return button;
  }

  async function evaluateContainer(container, force = false) {
    const planId = planIdFromContainer(container);
    if (!planId) return;
    try {
      const status = await postStatus(planId, force);
      const existing = container.querySelector(`.${BUTTON_CLASS}`);
      if (!status.eligible || status.completed) {
        existing?.remove();
        return;
      }
      if (existing) {
        existing.querySelector(".drpa-post-action__count").textContent = String(status.missing.length);
        existing.title = `Open the DR Plan extension to complete ${status.missing.length} missing post-approval requirement(s).`;
        return;
      }
      actionHost(container).append(createAction(status, planId));
    } catch {
      removeAction(container);
    }
  }

  function scan(force = false) {
    document.querySelectorAll(CONTAINER_SELECTOR).forEach(container => evaluateContainer(container, force));
  }

  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = globalThis.setTimeout(() => {
      scanTimer = null;
      scan(false);
    }, 350);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scan(true);
  });
  globalThis.addEventListener("focus", () => scan(true));
  extensionApi.runtime.onMessage.addListener(message => {
    if (message?.type === "POST_APPROVAL_STATUS_CHANGED") {
      cache.delete(Number(message.planId));
      scan(true);
    }
  });
  scan(false);
})();
