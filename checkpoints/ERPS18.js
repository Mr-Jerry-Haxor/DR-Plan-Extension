import { clean, FAIL, finding, linkedRows, REVIEW } from "./shared.js";
export default {
  id: "ERPS18", title: "Linked applications were active in ESATS and complete",
  validate(context) { const rows = linkedRows(context, "applications"); const incomplete = rows.filter(row => !clean(row.Application8657) || !clean(row.AppID8696)); return finding(this.id, incomplete.length ? FAIL : REVIEW, incomplete.length ? `${incomplete.length} linked application row(s) contain blank required data.` : `${rows.length} linked application(s) are complete in ERPS; approval-date ESATS status still requires authoritative evidence.`); }
};
