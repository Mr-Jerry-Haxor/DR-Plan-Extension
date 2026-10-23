import { FAIL, finding, memberRows, normalize, PASS } from "./shared.js";
export default {
  id: "ERPS19", title: "Recovery Team has a leader and backup or member",
  validate(context) { const roles = memberRows(context).map(row => normalize(row.RolePosition8347)); const leaders = roles.filter(role => /team leader$/.test(role)).length; const backups = roles.filter(role => /backup/.test(role)).length; const members = roles.filter(role => /team member/.test(role)).length; const ok = leaders === 1 && backups + members >= 1; return finding(this.id, ok ? PASS : FAIL, ok ? "One Team Leader and at least one backup/member are populated." : "Recovery Team leadership or backup/member coverage is incomplete."); }
};
