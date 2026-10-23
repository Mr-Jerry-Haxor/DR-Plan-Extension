import { finding, REVIEW } from "./shared.js";
export default { id: "ERPS27", title: "Earlier certification findings are addressed", validate(context) { const count = (context.nonPrintableDocuments || []).length; return finding(this.id, REVIEW, `${count} non-printable document record(s) were retrieved, but certification findings and document contents require review.`); } };
