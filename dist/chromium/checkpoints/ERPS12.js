import { appNames, dataCenterPresent, FAIL, finding, includesAll, PASS, plan } from "./shared.js";
export default {
  id: "ERPS12", title: "Activation criteria includes application and data center",
  validate(context) { const names = appNames(context); const value = plan(context).ActivationCriteria7951; const ok = names.length && includesAll(value, names) && dataCenterPresent(value); return finding(this.id, ok ? PASS : FAIL, ok ? "Activation criteria includes applications and a recovery location." : "Activation criteria is missing an application or recovery location."); }
};
