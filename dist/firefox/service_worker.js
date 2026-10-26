(function initializeBackground() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const FORM_API = "https://us-gov-rest-prd-formbuilder.continuitylogic.com/api";
  const ERPS_HOME = "https://boeing.continuitylogic.com/";
  const ESATS_ORIGIN = "https://esats.web.boeing.com";
  const ESATS_CONTACT_SUMMARY = "https://service-gateway.tas-phx.apps.boeing.com/gateway/asset/BusinessApplicationSummary/GetContactDetailsSummary";
  const VERSION = 1;
  const MAX_MESSAGE_BYTES = 100_000;
  const MAX_PLANS = 50_000;
  const PAGE_SIZE = 100;
  const PLAN_DATE_FIELDS = {
    "Orientation Validation": "OrientationDate8341",
    "Table Top Validation": "TableTopExerciseDate8336",
    "Drill Validation": "DrillDate8337"
  };
  const POST_PROCESS_DESCRIPTIONS = {
    "Orientation Validation": "Orientation email sent to recovery team participants listed in the DR plan to save the plan in local desktop for future reference.",
    "Table Top Validation": "All members of the recovery team are familiar with the documented recovery tasks and also verified that these tasks can be executed as outlined and will lead to the successful recovery of the asset.",
    "Drill Validation": "During the review, the recovery team examined the recovery team list, plan strategy, and activation criteria. At this time, no issues have been identified."
  };

  const CHILD_COLUMNS = {
    1504: ["Id", "TeamName7953"],
    1522: ["Id", "RolePosition8347", "Members8349"],
    1524: ["Id", "Sequence9446", "StartHours8364", "Duration8365", "CumulativeHours8547"],
    1525: ["Id", "DocumentName8371"],
    1526: ["Id", "DocumentName8376", "Description8380"],
    1530: ["Id", "Application8408", "ETTR9556", "ERP9557", "Strategy9558"],
    1531: ["Id"],
    1532: ["Id"],
    1538: ["Id"],
    1543: ["Id"],
    1544: ["Id", "Application8657", "AppID8696"],
    1545: ["Id", "Server8659", "ServerID8700"],
    1546: ["Id", "Database8661", "DBID8714"],
    1547: ["Id", "Hardware8663"],
    1548: ["Id", "ITService8665"],
    1550: ["Id", "Sequence9401", "CumulativeHours8682"],
    1610: ["Id", "TestExerciseType9526", "TestExerciseDate9527", "ApplicationTestedExercised9582", "Participants9530", "TestScenarioDescription9534"]
  };

  function configurePrimarySurface() {
    if (extensionApi.sidePanel?.setPanelBehavior) {
      return extensionApi.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch(() => undefined);
    }
    return Promise.resolve();
  }

  configurePrimarySurface();
  extensionApi.runtime.onInstalled.addListener(() => { configurePrimarySurface(); });
  if (extensionApi.runtime.onStartup) {
    extensionApi.runtime.onStartup.addListener(() => { configurePrimarySurface(); });
  }
  if (extensionApi.sidebarAction?.toggle && extensionApi.action?.onClicked) {
    extensionApi.action.onClicked.addListener(() => {
      extensionApi.sidebarAction.toggle().catch(() => undefined);
    });
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function positiveId(value, label = "entity ID") {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`A valid ${label} is required.`);
    return id;
  }

  function parseJson(value, fallback = null) {
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return fallback;
    }
  }

  function lookupArray(value) {
    const parsed = parseJson(value, []);
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  }

  function column(data) {
    return { data, name: "", searchable: true, orderable: true, search: { value: "", regex: false } };
  }

  async function fetchErps(url, options = {}) {
    const retries = options.retries ?? (options.method && options.method !== "GET" ? 1 : 2);
    const timeoutMs = options.timeoutMs ?? 30_000;
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: options.method || "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json, text/plain, */*",
            ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {})
          },
          body: options.body,
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401 || response.status === 403
              ? "ERPS session is not authorized. Sign in to ERPS and retry."
              : `ERPS request failed with HTTP ${response.status}.`
          );
        }
        const text = await response.text();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          throw new Error("ERPS returned a non-JSON response. Sign in to ERPS and retry.");
        }
      } catch (error) {
        lastError = error?.name === "AbortError" ? new Error("ERPS request timed out.") : error;
        if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 600 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  function responseRows(response) {
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.result)) return response.result;
    return [];
  }

  function listRequest({ formId, parentFormId, parentEntityId, start = 0, length = PAGE_SIZE, search = "", columns }) {
    return {
      draw: 1,
      columns: columns.map(column),
      order: [{ column: 0, dir: "asc" }],
      start,
      length,
      search: { value: search, regex: false },
      id: formId,
      parentformid: parentFormId,
      parententityid: parentEntityId,
      newEntityIdForSorting: 0,
      isReferrerRelationship: "False",
      isReadOnlyMode: "False",
      isPersonalizedForm: "True",
      ShowExportOptions: "False",
      personalizedFormId: String(formId),
      personalizedFormPeoplePickerFilters: "",
      isGlobalData: "False",
      collectionItems: null,
      drillerConfigId: 0,
      drillerFilterText: "",
      drillerSelectedFilters: [],
      showAllOptInOutRecords: false,
      drillerFieldFormId: "0",
      drillerFieldEntityId: "0",
      clearDrillerCache: false,
      WorkspaceId: "1"
    };
  }

  async function getPlanPage(start = 0, length = PAGE_SIZE, search = "") {
    const columns = [
      "Id", "PlanName7870", "LongPlanName8545", "PlanApprovalStatus8334",
      "PlanApprovalDate8330", "PlanRevisionLetter8342", "Organization8345", "PlanApprovers7920"
    ];
      const body = listRequest({
        formId: 1500,
        parentFormId: 1500,
        parentEntityId: 2,
        start,
        length: PAGE_SIZE,
        search: clean(search).slice(0, 120),
        columns
      });
      body.isGlobalData = "True";
      body.personalizedFormPeoplePickerFilters = "849,717,7919,7946,7920,7947,9586,8508,8505,9624";
      body.drillerConfigId = 5343;
    const response = await fetchErps(`${FORM_API}/formviewer`, { method: "POST", body: JSON.stringify(body) });
    const page = responseRows(response);
    const total = Number(response?.recordsFiltered ?? response?.recordsTotal) || page.length;
    if (total > MAX_PLANS) throw new Error(`ERPS returned ${total} DR Plans, exceeding the safe client limit of ${MAX_PLANS}.`);
    return {
      start,
      length,
      total,
      rows: page.map(row => ({
        id: Number(row.Id),
        name: clean(row.PlanName7870),
        longName: clean(row.LongPlanName8545),
        status: clean(row.PlanApprovalStatus8334),
        approvalDate: clean(row.PlanApprovalDate8330),
        revision: clean(row.PlanRevisionLetter8342),
        organization: clean(row.Organization8345),
        approverName: lookupArray(row.PlanApprovers7920)
          .map(person => clean(person.FullName9612 || person.FullNameFirstLast || person.Name || [person.FirstName608, person.LastName610].filter(Boolean).join(" ")))
          .filter(Boolean)
          .join(", ")
      })).filter(row => row.id && row.name)
    };
  }

  async function listPlans(search = "") {
    let start = 0;
    let total = 0;
    let pagesFetched = 0;
    const rows = [];
    do {
      const page = await getPlanPage(start, PAGE_SIZE, search);
      total = page.total;
      pagesFetched += 1;
      rows.push(...page.rows);
      start += PAGE_SIZE;
      if (!page.rows.length) break;
    } while (start < total);
    return { rows, total, pagesFetched, truncated: rows.length < total };
  }

  async function formMetadata(formId, parentFormId, parentEntityId) {
    const url = new URL(`${FORM_API}/formviewer/${positiveId(formId, "form ID")}`);
    url.searchParams.set("parentformid", positiveId(parentFormId, "parent form ID"));
    url.searchParams.set("parententityid", positiveId(parentEntityId, "parent entity ID"));
    url.searchParams.set("IsReferrerRelationship", "False");
    url.searchParams.set("IsReadOnlyMode", "False");
    url.searchParams.set("showExportOptions", "False");
    url.searchParams.set("WorkspaceId", "1");
    return fetchErps(url.toString());
  }

  async function collection(formId, parentFormId, parentEntityId) {
    const metadata = await formMetadata(formId, parentFormId, parentEntityId);
    const firstRows = Array.isArray(metadata?.EntityCollection) ? metadata.EntityCollection : [];
    const total = Number(metadata?.RecordCount) || firstRows.length;
    if (total <= firstRows.length) return firstRows;
    const rows = [];
    let start = 0;
    while (start < total) {
      const response = await fetchErps(`${FORM_API}/formviewer`, {
        method: "POST",
        body: JSON.stringify(listRequest({
          formId,
          parentFormId,
          parentEntityId,
          start,
          length: PAGE_SIZE,
          columns: CHILD_COLUMNS[formId] || ["Id"]
        }))
      });
      const page = responseRows(response);
      if (!page.length) break;
      rows.push(...page);
      start += page.length;
    }
    return rows;
  }

  function safePeople(value) {
    let records = lookupArray(value);
    if (!records.length && typeof value === "string") {
      records = value.split(",").map(id => ({ Id: clean(id) })).filter(person => person.Id);
    }
    return JSON.stringify(records.map(person => ({
      Id: person.Id,
      BEMSID2122: person.BEMSID2122,
      EmployeeStatus7331: person.EmployeeStatus7331
    })));
  }

  function safeApplication(value) {
    const app = lookupArray(value)[0] || {};
    return JSON.stringify([{
      ApplicationID1622: app.ApplicationID1622,
      ApplicationName1620: app.ApplicationName1620,
      RecoveryTimeObjective1624: app.RecoveryTimeObjective1624,
      RecoveryPointObjective1625: app.RecoveryPointObjective1625,
      ETTR7333: app.ETTR7333,
      AECLevel7341: app.AECLevel7341,
      RecoveryLevelRL7343: app.RecoveryLevelRL7343,
      SystemLifecycle7342: app.SystemLifecycle7342,
      IsActive: app.IsActive
    }]);
  }

  function safeAsset(value, keys) {
    const record = lookupArray(value)[0] || {};
    return JSON.stringify([{ ...Object.fromEntries(keys.map(key => [key, record[key]])), IsActive: record.IsActive }]);
  }

  function safeComponent(row) {
    return {
      Id: row.Id,
      Application8408: safeApplication(row.Application8408),
      ETTR9556: row.ETTR9556,
      ERP9557: row.ERP9557,
      Strategy9558: row.Strategy9558,
      PlanName8555: row.PlanName8555,
      AppID8556: row.AppID8556,
      ETTRLRT9588: row.ETTRLRT9588
    };
  }

  async function getEsatsSummary(assetId) {
    const id = clean(assetId);
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(id)) throw new Error("A valid ESATS application ID is required.");
    if (!extensionApi.tabs?.query || !extensionApi.scripting?.executeScript) {
      throw new Error("This browser does not support the signed-in ESATS session check.");
    }
    const tabs = await extensionApi.tabs.query({ url: ESATS_ORIGIN + "/*" });
    const tab = tabs.find(item => item.id && item.status === "complete") || tabs.find(item => item.id);
    if (!tab?.id) throw new Error("Open ESATS and sign in before running ESATS validation.");
    const url = new URL(ESATS_CONTACT_SUMMARY);
    url.searchParams.set("esatsId", id);
    const result = await extensionApi.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [url.toString(), ESATS_ORIGIN],
      func: async (requestUrl, origin) => {
        const normalize = raw => {
          if (!raw) return "";
          let value = String(raw).trim().replace(/^Bearer\s+/i, "");
          try {
            const parsed = JSON.parse(value);
            value = typeof parsed === "string" ? parsed : parsed?.esatsToken || parsed?.access_token || parsed?.token || "";
          } catch {}
          return String(value || "").trim();
        };
        const token = normalize(localStorage.getItem("esatsToken"));
        if (!token) return { ok: false, error: "No ESATS session token was found." };
        try {
          const response = await fetch(requestUrl, {
            headers: { Accept: "application/json, text/plain, */*", Authorization: "Bearer " + token },
            credentials: "omit",
            cache: "no-store",
            referrer: origin + "/",
            referrerPolicy: "strict-origin-when-cross-origin"
          });
          const text = await response.text();
          if (!response.ok) return { ok: false, error: "ESATS returned HTTP " + response.status + "." };
          return { ok: true, data: text ? JSON.parse(text) : null };
        } catch {
          return { ok: false, error: "The ESATS request could not be completed." };
        }
      }
    });
    const value = result?.[0]?.result;
    if (!value?.ok) throw new Error(value?.error || "ESATS did not return application data.");
    return value.data;
  }

  function findEsatsPrimitive(source, expression, depth = 0) {
    if (!source || typeof source !== "object" || depth > 6) return "";
    for (const [key, value] of Object.entries(source)) {
      if (expression.test(key) && value != null && typeof value !== "object") return clean(value);
    }
    for (const value of Object.values(source)) {
      const found = findEsatsPrimitive(value, expression, depth + 1);
      if (found) return found;
    }
    return "";
  }

  function findEsatsManagerIds(source, output = [], depth = 0) {
    if (!source || typeof source !== "object" || depth > 6) return output;
    if (clean(source.roleType?.name) === "ApplicationManager") {
      const users = Array.isArray(source.users) ? source.users : source.user ? [source.user] : [];
      users.forEach(user => {
        const id = clean(user?.bemsId || user?.bemsID || user?.employeeId);
        if (id) output.push(id.toLowerCase());
      });
    }
    Object.values(source).forEach(value => {
      if (value && typeof value === "object") findEsatsManagerIds(value, output, depth + 1);
    });
    return output;
  }

  async function getEsatsEvidence(planId) {
    const context = await loadPlan(planId);
    const applications = [];
    for (const component of context.applicationComponents) {
      const app = lookupArray(component.Application8408)[0] || {};
      const assetId = clean(app.ApplicationID1622 || component.AppID8556);
      try {
        const response = await getEsatsSummary(assetId);
        applications.push({
          componentId: Number(component.Id),
          assetId,
          available: true,
          organization: findEsatsPrimitive(response, /maintain.*org|organization/i),
          businessUnit: findEsatsPrimitive(response, /business.*unit/i),
          status: findEsatsPrimitive(response, /status|active/i),
          applicationManagerIds: [...new Set(findEsatsManagerIds(response))]
        });
      } catch (error) {
        applications.push({ componentId: Number(component.Id), assetId, available: false, error: clean(error.message) });
      }
    }
    return { applications };
  }

  async function loadPlan(planId) {
    const id = positiveId(planId, "plan ID");
    const url = new URL(`${FORM_API}/formviewer`);
    url.searchParams.set("formid", "1500");
    url.searchParams.set("entityid", id);
    url.searchParams.set("processNotifications", "true");
    url.searchParams.set("prePopulateLookupJSON", "true");
    url.searchParams.set("workspaceId", "1");
    url.searchParams.set("menuId", "0");
    url.searchParams.set("applyRules", "true");
    const response = await fetchErps(url.toString());
    const rows = parseJson(response?.FormDataJson, []);
    const rawPlan = Array.isArray(rows) ? rows[0] : rows;
    if (!rawPlan || Number(rawPlan.Id) !== id) throw new Error("ERPS did not return the selected DR Plan.");

    const [teams, recoveryTasks, printableDocuments, nonPrintableDocuments, itServices, databases, hardware, servers, rawComponents, validations] = await Promise.all([
      collection(1504, 1500, id),
      collection(1524, 1500, id),
      collection(1525, 1500, id),
      collection(1526, 1500, id),
      collection(1532, 1500, id),
      collection(1543, 1500, id),
      collection(1531, 1500, id),
      collection(1538, 1500, id),
      collection(1530, 1500, id),
      collection(1610, 1500, id)
    ]);

    const recoveryTeamMembers = (await Promise.all(teams.map(team => collection(1522, 1504, team.Id)))).flat();
    const applicationComponents = rawComponents.map(safeComponent);
    const linkedByComponent = {};
    await Promise.all(applicationComponents.map(async component => {
      const componentId = positiveId(component.Id, "component ID");
      const [linkedServices, linkedApplications, linkedDatabases, linkedServers, linkedHardware, linkedTasks] = await Promise.all([
        collection(1548, 1530, componentId),
        collection(1544, 1530, componentId),
        collection(1546, 1530, componentId),
        collection(1545, 1530, componentId),
        collection(1547, 1530, componentId),
        collection(1550, 1530, componentId)
      ]);
      linkedByComponent[componentId] = {
        services: linkedServices.map(row => ({ Id: row.Id })),
        applications: linkedApplications.map(row => ({ Id: row.Id, AppID8696: row.AppID8696, Application8657: safeApplication(row.Application8657) })),
        databases: linkedDatabases.map(row => ({ Id: row.Id, DBID8714: row.DBID8714, Database8661: safeAsset(row.Database8661, ["DBServerID6087", "DBName6091", "DBEnvironment8561"]) })),
        servers: linkedServers.map(row => ({ Id: row.Id, ServerID8700: row.ServerID8700, Server8659: safeAsset(row.Server8659, ["SISServerID6092", "ServerName6093", "Environment6103"]) })),
        hardware: linkedHardware.map(row => ({ Id: row.Id })),
        recoveryTasks: linkedTasks.map(row => ({
          Id: row.Id,
          TaskCategory8678: row.TaskCategory8678,
          Sequence9401: row.Sequence9401,
          Description8679: row.Description8679,
          StartHours8680: row.StartHours8680,
          Duration8681: row.Duration8681,
          CumulativeHours8682: row.CumulativeHours8682
        }))
      };
    }));

    const plan = {
      Id: rawPlan.Id,
      PlanName7870: rawPlan.PlanName7870,
      ParentFolder8435: rawPlan.ParentFolder8435,
      BusinessUnit8344: rawPlan.BusinessUnit8344,
      Organization8345: rawPlan.Organization8345,
      PlanOwner17919: safePeople(rawPlan.PlanOwner17919),
      PlanOwner28505: safePeople(rawPlan.PlanOwner28505),
      PlanApprovers7920: safePeople(rawPlan.PlanApprovers7920),
      Purpose7948: rawPlan.Purpose7948,
      Scope7921: rawPlan.Scope7921,
      Assumptions7949: rawPlan.Assumptions7949,
      RecoveryStrategies7950: rawPlan.RecoveryStrategies7950,
      ActivationCriteria7951: rawPlan.ActivationCriteria7951,
      ActivationProcedure7952: rawPlan.ActivationProcedure7952,
      ETTRGRT9587: rawPlan.ETTRGRT9587,
      PlanApprovalDate8330: rawPlan.PlanApprovalDate8330,
      PlanApprovalStatus8334: rawPlan.PlanApprovalStatus8334,
      OrientationDate8341: rawPlan.OrientationDate8341,
      TableTopExerciseDate8336: rawPlan.TableTopExerciseDate8336,
      DrillDate8337: rawPlan.DrillDate8337,
      FunctionalExerciseDate8338: rawPlan.FunctionalExerciseDate8338,
      PlanRevisionLetter8342: rawPlan.PlanRevisionLetter8342,
      RevisionDescription8343: rawPlan.RevisionDescription8343
    };

    return {
      plan,
      recoveryTeams: teams.map(row => ({ Id: row.Id, TeamName7953: row.TeamName7953 })),
      recoveryTeamMembers: recoveryTeamMembers.map(row => ({
        Id: row.Id,
        RolePosition8347: row.RolePosition8347,
        Members8349: safePeople(row.Members8349)
      })),
      recoveryTasks: recoveryTasks.map(row => ({
        Id: row.Id,
        TaskCategory8362: row.TaskCategory8362,
        Sequence9446: row.Sequence9446,
        Description8363: row.Description8363,
        StartHours8364: row.StartHours8364,
        Duration8365: row.Duration8365,
        CumulativeHours8547: row.CumulativeHours8547
      })),
      printableDocuments: printableDocuments.map(row => ({ Id: row.Id, DocumentName8371: row.DocumentName8371 })),
      nonPrintableDocuments: nonPrintableDocuments.map(row => ({ Id: row.Id, DocumentName8376: row.DocumentName8376, Description8380: row.Description8380 })),
      itServices: itServices.map(row => ({ Id: row.Id })),
      databases: databases.map(row => ({ Id: row.Id })),
      hardware: hardware.map(row => ({ Id: row.Id })),
      servers: servers.map(row => ({ Id: row.Id })),
      applicationComponents,
      linkedByComponent,
      validations: validations.map(row => ({
        Id: row.Id,
        TestExerciseType9526: row.TestExerciseType9526,
        TestExerciseDate9527: row.TestExerciseDate9527,
        ApplicationTestedExercised9582: row.ApplicationTestedExercised9582,
        Participants9530: safePeople(row.Participants9530),
        TestScenarioDescription9534: row.TestScenarioDescription9534,
        Result9539: row.Result9539,
        ArePlanUpdatesorActionsRequired9542: row.ArePlanUpdatesorActionsRequired9542
      }))
    };
  }

  function findField(value, fieldName) {
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value) && value.FieldName === fieldName) return value;
    for (const child of Object.values(value)) {
      const found = findField(child, fieldName);
      if (found) return found;
    }
    return null;
  }

  function setField(template, fieldName, value) {
    const field = findField(template, fieldName);
    if (!field) throw new Error(`ERPS form field ${fieldName} is unavailable.`);
    field.Value = value == null ? "" : String(value);
    if ("IsUserUpdated" in field) field.IsUserUpdated = true;
  }

  function participantEntityIds(context) {
    const ids = context.recoveryTeamMembers.flatMap(row => lookupArray(row.Members8349).map(person => clean(person.Id))).filter(Boolean);
    return [...new Set(ids)];
  }

  function componentRecoveryLevel(component) {
    const app = lookupArray(component?.Application8408)[0] || {};
    const match = clean(app.RecoveryLevelRL7343).match(/RL\s*([1-5])/i);
    return match ? Number(match[1]) : null;
  }

  function requirementFor(level, type) {
    const kind = {
      "Orientation Validation": "orientation",
      "Table Top Validation": "tabletop",
      "Drill Validation": "drill"
    }[type];
    const matrix = {
      1: { orientation: "required", tabletop: "required", drill: "optional" },
      2: { orientation: "required", tabletop: "required", drill: "required" },
      3: { orientation: "twice-yearly", tabletop: "required", drill: "required" },
      4: { orientation: "twice-yearly", tabletop: "not-required", drill: "optional" },
      5: { orientation: "twice-yearly", tabletop: "not-required", drill: "optional" }
    };
    return matrix[level]?.[kind] || null;
  }

  function isErpsPageSender(sender) {
    try {
      return new URL(sender?.tab?.url || "").origin === new URL(ERPS_HOME).origin;
    } catch {
      return false;
    }
  }

  async function postApprovalStatus(planId) {
    const context = await loadPlan(planId);
    const approved = clean(context.plan.PlanApprovalStatus8334).toLowerCase() === "approved";
    const approvalDate = canonicalErpsDate(context.plan.PlanApprovalDate8330);
    const eligible = approved && Boolean(approvalDate) && context.applicationComponents.length > 0;
    const missing = [];
    const actions = [];
    if (eligible) {
      const requiredTypes = new Set();
      for (const component of context.applicationComponents) {
        for (const type of Object.keys(PLAN_DATE_FIELDS)) {
          const requirement = requirementFor(componentRecoveryLevel(component), type);
          if (requirement !== "required" && requirement !== "twice-yearly") continue;
          requiredTypes.add(type);
        }
      }
      for (const type of requiredTypes) {
        const fieldName = PLAN_DATE_FIELDS[type];
        const planDate = canonicalErpsDate(context.plan[fieldName]);
        if (!planDate || planDate < approvalDate) {
          missing.push(`IT Plan header: ${type}`);
          for (const component of context.applicationComponents) {
            const requirement = requirementFor(componentRecoveryLevel(component), type);
            if (requirement !== "required" && requirement !== "twice-yearly") continue;
            actions.push({
              key: `${component.Id}:${type}`,
              componentId: Number(component.Id),
              applicationName: clean(component.PlanName8555) || `Application ${component.Id}`,
              type,
              date: displayErpsDate(context.plan.PlanApprovalDate8330),
              description: POST_PROCESS_DESCRIPTIONS[type],
              requirement,
              selected: true
            });
          }
        }
      }
    }
    return {
      planId: Number(context.plan.Id),
      planName: clean(context.plan.PlanName7870),
      approvalDate,
      approved,
      eligible,
      completed: eligible && missing.length === 0,
      missing: [...new Set(missing)],
      actions
    };
  }

  async function runPostApprovalProcess(planId, selectedKeys, sender) {
    if (!isErpsPageSender(sender)) throw new Error("Post-approval processing can be started only from ERPS.");
    const status = await postApprovalStatus(planId);
    if (!status.eligible || status.completed) throw new Error("This plan does not have pending required post-DR header dates.");
    if (!Array.isArray(selectedKeys) || selectedKeys.length === 0 || selectedKeys.length > status.actions.length) {
      throw new Error("Select one or more pending post-DR actions.");
    }
    const selected = new Set(selectedKeys.map(value => clean(value)));
    const items = status.actions.filter(action => selected.has(action.key));
    if (!items.length) throw new Error("The selected post-DR actions are no longer pending.");
    const outcome = await createValidations(planId, items);
    await notifyPostApprovalStatusChanged(planId, sender?.tab?.id);
    const audit = await recordWorkflowAudit(planId, outcome);
    return { ...outcome, workflowAudit: audit };
  }

  async function notifyPostApprovalStatusChanged(planId, sourceTabId) {
    try {
      let tabId = Number(sourceTabId);
      if (!Number.isSafeInteger(tabId) || tabId <= 0) {
        const stored = await extensionApi.storage.local.get("postProcessSourceTabId");
        tabId = Number(stored?.postProcessSourceTabId);
      }
      if (Number.isSafeInteger(tabId) && tabId > 0 && extensionApi.tabs?.sendMessage) {
        await extensionApi.tabs.sendMessage(tabId, { type: "POST_APPROVAL_STATUS_CHANGED", planId });
      }
    } catch {
      // The originating ERPS tab may have closed; no further action is required.
    }
  }

  async function captureWorkflowInitiator(payload, sender) {
    if (!isErpsPageSender(sender)) throw new Error("Workflow initiator can be captured only from ERPS.");
    const userId = clean(payload?.userId).slice(0, 40);
    const displayName = clean(payload?.displayName).slice(0, 120);
    if (userId && !/^[A-Za-z0-9._-]+$/.test(userId)) throw new Error("ERPS user identifier is invalid.");
    let verifiedUser = null;
    if (userId) {
      const url = new URL(`${FORM_API}/User/GetUser`);
      url.searchParams.set("UserName", userId);
      try { verifiedUser = await fetchErps(url.toString()); } catch { verifiedUser = null; }
    }
    const verifiedId = clean(verifiedUser?.UserName || verifiedUser?.EmployeeId || userId).slice(0, 40);
    const verifiedName = clean(verifiedUser?.FullNameFirstLast || displayName).slice(0, 120);
    const initiator = {
      userId: verifiedId || "Unavailable",
      displayName: verifiedName || "Unavailable",
      verifiedByErps: Boolean(verifiedUser),
      capturedAt: new Date().toISOString()
    };
    await extensionApi.storage.local.set({ workflowInitiator: initiator });
    return initiator;
  }

  function openWorkflowHistoryDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("erps_dr_plugin_db", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("erps_dr_plugin_table")) {
          const store = database.createObjectStore("erps_dr_plugin_table", { keyPath: "id", autoIncrement: true });
          store.createIndex("planId", "planId", { unique: false });
          store.createIndex("completedAt", "completedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Unable to open workflow history storage."));
    });
  }

  async function addWorkflowHistory(event) {
    const database = await openWorkflowHistoryDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("erps_dr_plugin_table", "readwrite");
        transaction.objectStore("erps_dr_plugin_table").add(event);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error("Unable to save workflow history."));
      });
    } finally {
      database.close();
    }
  }

  async function recordWorkflowAudit(planId, outcome) {
    const stored = await extensionApi.storage.local.get("workflowInitiator");
    const initiator = stored.workflowInitiator || {
      userId: "Unavailable",
      displayName: "Unavailable",
      capturedAt: new Date().toISOString()
    };
    const event = {
      planId: Number(planId),
      action: "post-dr-process",
      initiatedBy: {
        userId: initiator.userId,
        displayName: initiator.displayName
      },
      completedAt: new Date().toISOString(),
      createdCount: outcome.created.length,
      skippedCount: outcome.skipped.length,
      headerUpdated: Boolean(outcome.headerUpdate?.changed)
    };
    await addWorkflowHistory(event);
    return event;
  }

  function validationStrategy(value) {
    const normalized = clean(value).toLowerCase();
    if (normalized.includes("automatic") && normalized.includes("failover")) return "Automatic Failover Recovery";
    if (normalized.includes("manual")) return "Manual Failover Recovery";
    if (normalized.includes("dev") || normalized.includes("pre-prod") || normalized.includes("pre-production")) return "Recovery on Dev; Test or Pre-Production";
    if (normalized.includes("dedicated") || normalized.includes("shared recovery")) return "Recovery Failover on Dedicated; Shared Recovery Environment";
    if (normalized.includes("replacement")) return "Recovery on Replacement Equipment";
    return "";
  }

  function validErpsDate(value) {
    const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
    return date.getUTCFullYear() === Number(match[3]) && date.getUTCMonth() === Number(match[1]) - 1 && date.getUTCDate() === Number(match[2]);
  }

  function dateParts(value) {
    const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return match ? [Number(match[3]), Number(match[1]), Number(match[2])] : [];
  }

  function sameErpsDate(left, right) {
    return JSON.stringify(dateParts(left)) === JSON.stringify(dateParts(right)) && dateParts(left).length === 3;
  }

  function canonicalErpsDate(value) {
    const parts = dateParts(value);
    return parts.length === 3
      ? `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`
      : clean(value);
  }

  function displayErpsDate(value) {
    const parts = dateParts(value);
    return parts.length === 3
      ? `${String(parts[1]).padStart(2, "0")}/${String(parts[2]).padStart(2, "0")}/${parts[0]}`
      : clean(value);
  }

  async function getFullPlanForm(planId) {
    const url = new URL(`${FORM_API}/formviewer`);
    url.searchParams.set("formid", "1500");
    url.searchParams.set("entityid", positiveId(planId, "plan ID"));
    url.searchParams.set("processNotifications", "true");
    url.searchParams.set("prePopulateLookupJSON", "true");
    url.searchParams.set("workspaceId", "1");
    url.searchParams.set("menuId", "0");
    url.searchParams.set("applyRules", "true");
    return fetchErps(url.toString());
  }

  async function updatePlanValidationDates(planId, items) {
    const dates = [...new Set(items.map(item => clean(item.date)))];
    if (dates.length !== 1) throw new Error("All records in one post-approval run must use the same validation date.");
    const date = dates[0];
    const fieldNames = [...new Set(items.map(item => PLAN_DATE_FIELDS[clean(item.type)]).filter(Boolean))];
    if (!fieldNames.length) return { changed: false, fields: [], date };
    const template = await getFullPlanForm(planId);
    if (Number(template?.EntityId) !== Number(planId) || Number(template?.Id) !== 1500) {
      throw new Error("ERPS did not return the selected IT Plan for date synchronization.");
    }
    const changedFields = fieldNames.filter(fieldName => !sameErpsDate(findField(template, fieldName)?.Value, date));
    if (!changedFields.length) return { changed: false, fields: fieldNames, date };
    for (const fieldName of changedFields) setField(template, fieldName, date);
    const putUrl = new URL(`${FORM_API}/formviewer`);
    putUrl.searchParams.set("entityid", positiveId(planId, "plan ID"));
    putUrl.searchParams.set("parentformid", "0");
    putUrl.searchParams.set("parententityid", "0");
    putUrl.searchParams.set("isDraft", "false");
    putUrl.searchParams.set("workflowIdAssociatedWithButton", "0");
    putUrl.searchParams.set("sendBackLevelId", "0");
    putUrl.searchParams.set("bizAccessNewRec", "false");
    const saved = await fetchErps(putUrl.toString(), {
      method: "PUT",
      retries: 1,
      timeoutMs: 45_000,
      body: JSON.stringify(template)
    });
    if (Number(saved?.EntityId) !== Number(planId)) throw new Error("ERPS did not confirm the IT Plan date update.");
    for (const fieldName of changedFields) {
      if (!sameErpsDate(findField(saved, fieldName)?.Value, date)) {
        throw new Error(`ERPS did not confirm ${fieldName} as ${date}.`);
      }
    }
    return { changed: true, fields: changedFields, date };
  }

  async function releasePlan(planId) {
    const releaseUrl = new URL(`${FORM_API}/formviewer`);
    releaseUrl.searchParams.set("formid", "1500");
    releaseUrl.searchParams.set("entityid", positiveId(planId, "plan ID"));
    releaseUrl.searchParams.set("isActive", "true");
    releaseUrl.searchParams.set("WorkspaceId", "1");
    try {
      await fetch(releaseUrl.toString(), { method: "PUT", credentials: "include", cache: "no-store" });
    } catch {
      // A release is best effort and does not undo a confirmed save.
    }
  }

  async function createValidations(planId, requestedItems) {
    if (!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length > 20) {
      throw new Error("Select between 1 and 20 validation records.");
    }
    const context = await loadPlan(planId);
    if (clean(context.plan.PlanApprovalStatus8334).toLowerCase() !== "approved") {
      throw new Error("Post-approval records can be created only for an Approved DR Plan.");
    }
    const components = new Map(context.applicationComponents.map(component => [Number(component.Id), component]));
    const participants = participantEntityIds(context);
    if (!participants.length) throw new Error("No Recovery Team participants are available for the validation records.");
    const existing = new Set(context.validations.map(row => [
      row.ApplicationTestedExercised9582,
      clean(row.TestExerciseType9526).toLowerCase(),
      canonicalErpsDate(row.TestExerciseDate9527)
    ].join("|")));
    const created = [];
    const skipped = [];
    const prepared = [];
    for (const item of requestedItems) {
      const component = components.get(Number(item.componentId));
      if (!component) throw new Error("A selected application component is no longer available.");
      const type = clean(item.type);
      const date = clean(item.date);
      const description = clean(item.description);
      if (!["Orientation Validation", "Table Top Validation", "Drill Validation"].includes(type)) throw new Error("Unsupported validation type.");
      const requirement = requirementFor(componentRecoveryLevel(component), type);
      if (!requirement || requirement === "not-required") throw new Error(`${type} is not applicable to this application's recovery level.`);
      if (!validErpsDate(date)) throw new Error("Validation date must be a valid MM/DD/YYYY date.");
      if (description.length < 20 || description.length > 2000) throw new Error("Validation description must contain 20 to 2,000 characters.");
      const duplicateKey = [component.Id, type.toLowerCase(), canonicalErpsDate(date)].join("|");
      if (existing.has(duplicateKey)) {
        skipped.push({ componentId: component.Id, type, date, reason: "An identical record already exists." });
      } else {
        prepared.push({ component, type, date, description, duplicateKey });
      }
    }

    let headerUpdate;
    try {
      headerUpdate = await updatePlanValidationDates(context.plan.Id, requestedItems);
      for (const preparedItem of prepared) {
        const { component, type, date, description, duplicateKey } = preparedItem;

        const newUrl = new URL(`${FORM_API}/form`);
        newUrl.searchParams.set("withNewEntityId", "true");
        newUrl.searchParams.set("formId", "1610");
        newUrl.searchParams.set("parentFormId", "1500");
        newUrl.searchParams.set("parentEntityId", context.plan.Id);
        newUrl.searchParams.set("WorkspaceId", "1");
        newUrl.searchParams.set("bizAccessNewRec", "false");
        const template = await fetchErps(newUrl.toString());
        const entityId = positiveId(template?.EntityId, "new validation entity ID");
        const typeField = findField(template, "TestExerciseType9526");
        const typeOptions = clean(typeField?.Options).split(",").map(option => option.trim()).filter(Boolean);
        if (!typeOptions.includes(type)) throw new Error(`${type} is not available in the current ERPS form.`);
        const strategy = validationStrategy(component.Strategy9558);
        const strategyField = findField(template, "RecoveryStrategiesDiscussedTested9535");
        const strategyOptions = clean(strategyField?.Options).split(",").map(option => option.trim()).filter(Boolean);
        if (!strategy || !strategyOptions.includes(strategy)) {
          throw new Error(`Recovery strategy '${clean(component.Strategy9558)}' cannot be mapped to the current ERPS options.`);
        }
        setField(template, "TestExerciseID9525", entityId);
        setField(template, "TestExerciseType9526", type);
        setField(template, "TestExerciseDate9527", date);
        setField(template, "ApplicationTestedExercised9582", component.Id);
        setField(template, "Participants9530", participants.join(","));
        setField(template, "TestScenarioDescription9534", description);
        setField(template, "RecoveryStrategiesDiscussedTested9535", strategy);
        setField(template, "Result9539", type === "Orientation Validation" ? "" : "Passed");
        setField(template, "ArePlanUpdatesorActionsRequired9542", type === "Orientation Validation" ? "" : "No");
        setField(template, "Value9585", type === "Orientation Validation" || type === "Table Top Validation" ? "1" : "2");

        const putUrl = new URL(`${FORM_API}/formviewer`);
        putUrl.searchParams.set("entityid", entityId);
        putUrl.searchParams.set("parentformid", "1500");
        putUrl.searchParams.set("parententityid", context.plan.Id);
        putUrl.searchParams.set("isDraft", "false");
        putUrl.searchParams.set("workflowIdAssociatedWithButton", "0");
        putUrl.searchParams.set("sendBackLevelId", "0");
        putUrl.searchParams.set("bizAccessNewRec", "false");
        const saved = await fetchErps(putUrl.toString(), {
          method: "PUT",
          retries: 1,
          timeoutMs: 45_000,
          body: JSON.stringify(template)
        });
        if (Number(saved?.EntityId) !== entityId) throw new Error(`ERPS did not confirm validation entity ${entityId}.`);
        const savedType = clean(findField(saved, "TestExerciseType9526")?.Value);
        if (savedType !== type) throw new Error(`ERPS response did not confirm ${type}.`);
        created.push({ entityId, componentId: component.Id, type, date });
        existing.add(duplicateKey);
        await releasePlan(context.plan.Id);
      }
    } catch (error) {
      error.details = { created, skipped, headerUpdate: headerUpdate || null };
      throw error;
    }
    return { created, skipped, headerUpdate, planName: clean(context.plan.PlanName7870) };
  }

  async function handle(message, sender) {
    if (!message || message.version !== VERSION || typeof message.type !== "string" || typeof message.requestId !== "string") {
      throw new Error("Invalid extension message.");
    }
    const payload = message.payload || {};
    switch (message.type) {
      case "CHECK_SESSION": {
        const roles = await fetchErps(`${FORM_API}/Role`);
        return { authenticated: Array.isArray(roles) || Boolean(roles), erpsUrl: ERPS_HOME };
      }
      case "LIST_PLANS":
        return listPlans(payload.search);
      case "LIST_PLANS_PAGE":
        return getPlanPage(payload.start, payload.length, payload.search);
      case "LOAD_PLAN":
        return loadPlan(payload.planId);
      case "GET_ESATS_EVIDENCE":
        return getEsatsEvidence(payload.planId);
      case "GET_POST_APPROVAL_STATUS":
        if (!isErpsPageSender(sender)) throw new Error("Post-approval status can be requested only from ERPS.");
        return postApprovalStatus(payload.planId);
      case "RUN_POST_APPROVAL_PROCESS":
        return runPostApprovalProcess(payload.planId, payload.selectedKeys, sender);
      case "CAPTURE_WORKFLOW_INITIATOR":
        return captureWorkflowInitiator(payload, sender);
      case "GET_WORKFLOW_INITIATOR": {
        const stored = await extensionApi.storage.local.get("workflowInitiator");
        return stored.workflowInitiator || null;
      }
      case "CREATE_VALIDATIONS": {
        const created = await createValidations(payload.planId, payload.items);
        await notifyPostApprovalStatusChanged(payload.planId, sender?.tab?.id);
        const audit = await recordWorkflowAudit(payload.planId, created);
        return { ...created, workflowAudit: audit };
      }
      default:
        throw new Error("Unsupported extension message type.");
    }
  }

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender?.id && sender.id !== extensionApi.runtime.id) return false;
    let size = 0;
    try { size = JSON.stringify(message).length; } catch { size = MAX_MESSAGE_BYTES + 1; }
    if (size > MAX_MESSAGE_BYTES) {
      sendResponse({ ok: false, error: { code: "MESSAGE_TOO_LARGE", message: "Request is too large." } });
      return false;
    }
    Promise.resolve(handle(message, sender))
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({
        ok: false,
        error: {
          code: "REQUEST_FAILED",
          message: clean(error?.message) || "Extension request failed.",
          ...(error?.details ? { details: error.details } : {})
        }
      }));
    return true;
  });
})();
