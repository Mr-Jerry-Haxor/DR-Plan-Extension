import { appNames, clean, dataCenterPresent, FAIL, finding, includesAll, PASS, plan } from "./shared.js";
export default {
  id: "ERPS7", title: "Scope includes applications, locations, inclusions, and exclusions",
  validate(context) { const names = appNames(context); const value = clean(plan(context).Scope7921); const ok = names.length > 0 && includesAll(value, names) && dataCenterPresent(value) && /includ/i.test(value) && /exclud/i.test(value); return finding(this.id, ok ? PASS : FAIL, ok ? "Scope contains applications, location, inclusions, and exclusions." : "Scope is missing one or more required elements."); }
};
