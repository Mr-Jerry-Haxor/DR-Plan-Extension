import { apps, clean, FAIL, finding, numeric, PASS, plan } from "./shared.js";
export default {
  id: "ERPS11", title: "ERP is populated and non-zero when data is recovered",
  validate(context) { const recoversData = /data|backup|back-up|database|restore/i.test(clean(plan(context).RecoveryStrategies7950)); const bad = apps(context).filter(component => numeric(component.ERP9557) === null || (recoversData && numeric(component.ERP9557) <= 0)); return finding(this.id, bad.length ? FAIL : PASS, bad.length ? "ERP is blank/invalid, or zero while data recovery is documented." : "ERP is populated and non-zero where data recovery is documented."); }
};
