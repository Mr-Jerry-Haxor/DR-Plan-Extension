import { FAIL, finding, PASS, people, plan, unique } from "./shared.js";
export default {
  id: "ERPS5", title: "Plan Owner matches Plan Approver",
  validate(context) {
    const values = plan(context);
    const owners = unique([values.PlanOwner17919, values.PlanOwner28505].flatMap(value => people(value).map(person => person.id)));
    const approvers = unique(people(values.PlanApprovers7920).map(person => person.id));
    const matches = owners.length && approvers.length && owners.some(id => approvers.includes(id));
    return finding(this.id, matches ? PASS : FAIL, matches ? "A Plan Owner exactly matches a Plan Approver." : "No exact Plan Owner and Plan Approver match was found.");
  }
};
