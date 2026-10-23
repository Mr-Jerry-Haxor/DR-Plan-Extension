import { FAIL, finding, PASS } from "./shared.js";
export default {
  id: "ERPS14", title: "Application plan has no top-level infrastructure components",
  validate(context) { const count = (context.itServices || []).length + (context.databases || []).length + (context.hardware || []).length + (context.servers || []).length; return finding(this.id, count === 0 ? PASS : FAIL, count === 0 ? "Application plan has no top-level IT Service, Database, Hardware, or Server records." : `${count} prohibited top-level infrastructure record(s) were found.`); }
};
