(function initializeErpsPostApprovalAction() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const CONTAINER_SELECTOR = '[id^="formentrycontainer1500_ENTITY_"]';
  const BUTTON_CLASS = "drpa-post-action";
  const SIDEBAR_ITEM_ID = "drpa-erps-sidebar-item";
  const EMBEDDED_PANEL_ID = "drpa-erps-embedded-panel";
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

  function currentPlanId() {
    const containers = [...document.querySelectorAll(CONTAINER_SELECTOR)];
    const visible = containers.find(container => {
      const form = container.querySelector('[id^="formContainer1500"]');
      return form && globalThis.getComputedStyle(form).display !== "none";
    });
    return planIdFromContainer(visible || containers.at(-1));
  }

  function embeddedUrl(planId, view) {
    const url = new URL(extensionApi.runtime.getURL("popup.html"));
    url.searchParams.set("view", "embedded");
    if (Number.isSafeInteger(Number(planId)) && Number(planId) > 0) {
      url.searchParams.set("planId", String(Number(planId)));
      url.searchParams.set("pendingView", view);
    }
    return url.toString();
  }

  function initiatorEvidence() {
    const displayName = document.querySelector("#userAvatarDetails .user-primary-text")?.textContent?.trim() || "";
    const userId = document.querySelector("#userAvatarDetails .user-secondary-text span")?.textContent?.trim() ||
      document.querySelector("#userAvatarDetails .user-secondary-text")?.getAttribute("title")?.trim() || "";
    return { displayName, userId };
  }

  async function captureInitiator() {
    try {
      await request("CAPTURE_WORKFLOW_INITIATOR", initiatorEvidence());
    } catch {
      // The embedded UI will show that initiator evidence is unavailable.
    }
  }

  function returnToErpsHome() {
    const dashboard = document.querySelector("#left-panel .menu-item-dashboard");
    if (dashboard) dashboard.click();
    else globalThis.location.assign("/");
  }

  function openEmbeddedPanel(planId, view = "explorer") {
    const source = embeddedUrl(planId, view);
    const host = document.querySelector("#content") || document.querySelector("#main");
    if (!host) return;
    const existing = document.getElementById(EMBEDDED_PANEL_ID);
    if (existing) {
      const frame = existing.querySelector("iframe");
      if (frame?.src !== source) frame.src = source;
      return;
    }
    const shell = document.createElement("section");
    shell.id = EMBEDDED_PANEL_ID;
    shell.className = "drpa-erps-main-page";
    shell.setAttribute("aria-label", "DR Plan Review and Automation");
    const header = document.createElement("header");
    header.className = "drpa-erps-main-page__header";
    const title = document.createElement("strong");
    title.textContent = "DR Plan Review and Automation";
    const home = document.createElement("button");
    home.type = "button";
    home.className = "drpa-erps-main-page__home";
    home.textContent = "Return to ERPS Dashboard";
    home.addEventListener("click", returnToErpsHome);
    header.append(title, home);
    const frame = document.createElement("iframe");
    frame.className = "drpa-erps-main-page__frame";
    frame.src = source;
    frame.title = "DR Plan Review and Automation";
    shell.append(header, frame);
    host.replaceChildren(shell);
  }

  async function openDrPlugin(anchor) {
    const label = anchor.querySelector(".drpa-erps-sidebar-label");
    const original = label?.textContent || "DR Plugin";
    if (label) label.textContent = "Opening…";
    await captureInitiator();
    openEmbeddedPanel(null, "explorer");
    globalThis.setTimeout(() => {
      if (anchor.isConnected && label) label.textContent = original;
    }, 700);
  }

  function ensureSidebarAction() {
    if (document.getElementById(SIDEBAR_ITEM_ID)) return;
    const menu = document.querySelector("#profile-alert > ul.side-nav-menu") ||
      document.querySelector("#left-panel .sidenav-middle-section ul.side-nav-menu");
    if (!menu) return;
    const item = document.createElement("li");
    item.id = SIDEBAR_ITEM_ID;
    item.className = "menu-link-item drpa-erps-sidebar-item";
    item.title = "Open DR Plan Review and Automation";
    item.setAttribute("data-toggle", "tooltip");
    item.setAttribute("data-placement", "right");
    const anchor = document.createElement("a");
    anchor.href = "#";
    anchor.className = "menu-item-link side-navbar-text drpa-erps-sidebar-link";
    anchor.setAttribute("role", "button");
    const iconWrap = document.createElement("span");
    iconWrap.className = "menu-link-icon";
    const icon = document.createElement("i");
    icon.className = "fal fa-shield-check";
    icon.setAttribute("aria-hidden", "true");
    iconWrap.append(icon);
    const label = document.createElement("span");
    label.className = "menu-link-text ms-3 drpa-erps-sidebar-label";
    label.textContent = "DR Plugin";
    anchor.append(iconWrap, label);
    anchor.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openDrPlugin(anchor);
    });
    item.append(anchor);
    const settings = menu.querySelector("#menu-settings");
    menu.insertBefore(item, settings || null);
  }

  function removeAction(container) {
    container.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
  }

  async function openWorkflow(button, planId) {
    button.disabled = true;
    const original = button.querySelector(".drpa-post-action__label")?.textContent || "Complete Post-DR Process";
    const label = button.querySelector(".drpa-post-action__label");
    if (label) label.textContent = "Opening DR Plugin…";
    await captureInitiator();
    openEmbeddedPanel(planId, "automation");
    globalThis.setTimeout(() => {
      button.disabled = false;
      if (button.isConnected && label) label.textContent = original;
    }, 700);
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
    ensureSidebarAction();
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
  ensureSidebarAction();
  scan(false);
})();
