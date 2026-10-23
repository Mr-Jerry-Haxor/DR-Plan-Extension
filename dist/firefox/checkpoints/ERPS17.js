import { finding, linkedRows, REVIEW } from "./shared.js";
export default { id: "ERPS17", title: "Linked databases were active in GSEP", validate(context) { const rows = linkedRows(context, "databases"); return finding(this.id, REVIEW, `${rows.length} linked database(s) were retrieved; approval-date GSEP status still requires authoritative evidence.`); } };
