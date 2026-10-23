import { finding, linkedRows, REVIEW } from "./shared.js";
export default { id: "ERPS16", title: "Linked servers match historical GSEP evidence", validate(context) { const rows = linkedRows(context, "servers"); return finding(this.id, REVIEW, `${rows.length} linked server(s) were retrieved; historical GSEP completeness and status still require authoritative evidence.`); } };
