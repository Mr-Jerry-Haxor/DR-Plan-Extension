import { appNames, dataCenterPresent, FAIL, finding, includesAll, PASS, plan } from "./shared.js";
export default {
  id: "ERPS6", title: "Purpose includes applications and data centers",
  validate(context) { const names = appNames(context); const value = plan(context).Purpose7948; const ok = names.length > 0 && includesAll(value, names) && dataCenterPresent(value); return finding(this.id, ok ? PASS : FAIL, ok ? "Purpose includes every application and a data-center or geographic location." : "Purpose is missing an application name or data-center/geographic location."); }
};
