import { apps, clean, FAIL, finding, PASS, plan, strategyKeywords } from "./shared.js";
export default {
  id: "ERPS10", title: "Plan and component recovery strategies agree",
  validate(context) { const root = strategyKeywords(clean(plan(context).RecoveryStrategies7950)); const mismatch = apps(context).some(component => { const child = strategyKeywords(component.Strategy9558); return root.length && child.length && !root.some(key => child.includes(key)); }); return finding(this.id, mismatch ? FAIL : PASS, mismatch ? "A component strategy conflicts with the plan strategy." : "No conflict was found between plan and component strategies."); }
};
