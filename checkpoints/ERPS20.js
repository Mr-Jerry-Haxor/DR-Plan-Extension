import { FAIL, finding, memberRows, normalize, PASS, people } from "./shared.js";
export default {
  id: "ERPS20", title: "Recovery Team roles are unique",
  validate(context) { const rows = memberRows(context); const roles = rows.map(row => normalize(row.RolePosition8347)); const leaders = roles.filter(role => /team leader$/.test(role)).length; const backups = roles.filter(role => /backup/.test(role)).length; const byPerson = new Map(); for (const row of rows) for (const person of people(row.Members8349)) { const set = byPerson.get(person.id) || new Set(); set.add(normalize(row.RolePosition8347)); byPerson.set(person.id, set); } const duplicated = [...byPerson.values()].some(set => set.size > 1); const ok = leaders === 1 && backups <= 1 && !duplicated; return finding(this.id, ok ? PASS : FAIL, ok ? "Leadership roles are unique and each person has one role." : "Duplicate leadership or multi-role membership was found."); }
};
