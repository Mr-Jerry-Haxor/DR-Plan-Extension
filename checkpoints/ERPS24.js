import { clean, FAIL, finding, PASS, tasks } from "./shared.js";
export default {
  id: "ERPS24", title: "A task assembles the Recovery Team",
  validate(context) { const exists = tasks(context).some(task => /(?:assemble|gather|contact).{0,30}recovery team|recovery team.{0,30}(?:assemble|gather|contact)/i.test(`${clean(task.TaskCategory8362)} ${clean(task.Description8363)}`)); return finding(this.id, exists ? PASS : FAIL, exists ? "A Recovery Team assembly task exists." : "No Recovery Team assembly task was found."); }
};
