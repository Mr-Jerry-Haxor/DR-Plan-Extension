import { FAIL, finding, PASS, people, plan, REVIEW, unique } from "./shared.js";
export default {
  id: "ERPS5", title: "Plan Owner matches Plan Approver",
  validate(context) {
    const values = plan(context);
    const owners = unique([values.PlanOwner17919, values.PlanOwner28505].flatMap(value => people(value).map(person => person.id)));
    const approvers = unique(people(values.PlanApprovers7920).map(person => person.id));
    const matches = owners.length && approvers.length && owners.some(id => approvers.includes(id));
    if (!matches) return finding(this.id, FAIL, "No exact Plan Owner and Plan Approver match was found.");
    const available = (context.esatsEvidence?.applications || []).filter(item => item.available);
    if (!available.length) return finding(this.id, REVIEW, "Plan Owner and Plan Approver match in ERPS; ESATS Application Manager evidence is unavailable.");
    const managers = unique(available.flatMap(item => item.applicationManagerIds || []));
    if (!managers.length) return finding(this.id, REVIEW, "Plan Owner and Plan Approver match in ERPS; ESATS did not return an Application Manager.");
    const managerMatch = [...owners, ...approvers].some(id => managers.includes(id));
    return finding(this.id, managerMatch ? PASS : FAIL, managerMatch ? "Plan Owner/Approver match in ERPS and one matches the ESATS Application Manager." : "Plan Owner/Approver match in ERPS but neither matches the ESATS Application Manager.");
  }
};
