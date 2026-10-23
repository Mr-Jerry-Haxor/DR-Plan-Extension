import { clean, finding, plan, REVIEW } from "./shared.js";
export default { id: "ERPS2", title: "Plan revision letter is incremented", validate(context) { return finding(this.id, REVIEW, `Current revision is ${clean(plan(context).PlanRevisionLetter8342) || "blank"}; the previously approved plan version was not retrieved.`); } };
