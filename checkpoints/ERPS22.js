import { clean, FAIL, finding, numeric, PASS, tasks } from "./shared.js";
export default {
  id: "ERPS22", title: "General tasks start at zero and end in recovery",
  validate(context) { const rows = tasks(context); const starts = numeric(rows[0]?.StartHours8364) === 0; const ends = /recover(?:ed|y)|resume.+production|available/i.test(`${clean(rows.at(-1)?.TaskCategory8362)} ${clean(rows.at(-1)?.Description8363)}`); return finding(this.id, starts && ends ? PASS : FAIL, starts && ends ? "Tasks start at zero and end with application/system recovery." : "Task timeline does not start at zero or end with recovery."); }
};
