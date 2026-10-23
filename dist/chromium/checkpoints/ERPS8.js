import { clean, FAIL, finding, plan, REVIEW } from "./shared.js";
export default {
  id: "ERPS8", title: "Assumptions are present and consistent",
  validate(context) { const value = clean(plan(context).Assumptions7949); return finding(this.id, !value || /\bREMT\b/i.test(value) ? FAIL : REVIEW, !value ? "No assumptions are documented." : /\bREMT\b/i.test(value) ? "REMT is listed as an assumption." : "Assumptions are present and REMT is absent; consistency with every procedure needs semantic review."); }
};
