import { FAIL, finding, numeric, PASS, tasks } from "./shared.js";
export default {
  id: "ERPS23", title: "General task time arithmetic is correct",
  validate(context) { const errors = tasks(context).filter(task => { const start = numeric(task.StartHours8364); const duration = numeric(task.Duration8365); const cumulative = numeric(task.CumulativeHours8547); return start === null || duration === null || cumulative === null || Math.abs(start + duration - cumulative) > .001; }); return finding(this.id, errors.length ? FAIL : PASS, errors.length ? `${errors.length} task row(s) have incorrect start + duration arithmetic.` : "Start plus duration equals cumulative time for every task."); }
};
