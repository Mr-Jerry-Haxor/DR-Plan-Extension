import { apps, FAIL, finding, numeric, PASS, tasks } from "./shared.js";
export default {
  id: "ERPS15", title: "Component ETTR equals task timeline",
  validate(context) { const maxGeneral = Math.max(0, ...tasks(context).map(task => numeric(task.CumulativeHours8547) || 0)); const mismatch = apps(context).some(component => { const linked = context.linkedByComponent?.[component.Id]?.recoveryTasks || []; const timeline = linked.length ? Math.max(0, ...linked.map(task => numeric(task.CumulativeHours8682) || 0)) : maxGeneral; return numeric(component.ETTR9556) !== timeline; }); return finding(this.id, mismatch ? FAIL : PASS, mismatch ? "A component ETTR does not equal its applicable task timeline." : "Component ETTR values equal the applicable task timeline."); }
};
