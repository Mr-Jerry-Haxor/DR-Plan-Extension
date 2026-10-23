import { clean, FAIL, finding, plan, REVIEW } from "./shared.js";
export default {
  id: "ERPS9", title: "Recovery strategy is consistent with scope",
  validate(context) { const values = plan(context); const strategy = clean(values.RecoveryStrategies7950); const scope = clean(values.Scope7921); return finding(this.id, !strategy || !scope ? FAIL : REVIEW, !strategy || !scope ? "Scope or recovery strategy is blank." : "Scope and recovery strategy are documented; semantic consistency requires reviewer confirmation."); }
};
