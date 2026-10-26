import { clean, FAIL, finding, linkedRows, normalize, REVIEW } from "./shared.js";

export default {
  id: "ERPS18",
  title: "Linked applications were active in ESATS and complete",
  validate(context) {
    const rows = linkedRows(context, "applications");
    const incomplete = rows.filter(row => !clean(row.Application8657) || !clean(row.AppID8696));
    if (incomplete.length) return finding(this.id, FAIL, String(incomplete.length) + " linked application row(s) contain blank required data.");
    const evidence = context.esatsEvidence?.applications || [];
    const unavailable = evidence.filter(item => !item.available);
    if (unavailable.length) return finding(this.id, REVIEW, "One or more ESATS application checks are unavailable.");
    const inactive = evidence.filter(item => /inactive|retired|deleted/i.test(normalize(item.status)));
    if (inactive.length) return finding(this.id, FAIL, String(inactive.length) + " application(s) are inactive in ESATS.");
    const noStatus = evidence.filter(item => !clean(item.status));
    return finding(this.id, REVIEW, noStatus.length ? "ESATS returned application records without a status; approval-date history requires review." : String(rows.length) + " linked application(s) are complete; live ESATS status is available but approval-date history still requires review.");
  }
};
