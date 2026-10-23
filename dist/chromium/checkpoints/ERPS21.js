import { FAIL, finding, memberRows, normalize, people, REVIEW } from "./shared.js";
export default {
  id: "ERPS21", title: "Named employees were active at approval",
  validate(context) { const inactive = memberRows(context).flatMap(row => people(row.Members8349)).filter(person => normalize(person.status) && normalize(person.status) !== "active"); return finding(this.id, inactive.length ? FAIL : REVIEW, inactive.length ? `${inactive.length} team member(s) are not active in the embedded snapshot.` : "Embedded member snapshots are active; approval-date employee status requires historical evidence."); }
};
