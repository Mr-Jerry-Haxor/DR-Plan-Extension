import { clean, FAIL, finding, PASS, plan } from "./shared.js";
export default {
  id: "ERPS3", title: "Current revision description is documented",
  validate(context) {
    const values = plan(context); const letter = clean(values.PlanRevisionLetter8342);
    const described = letter && new RegExp(`(?:rev(?:ision)?\\s*)${letter}\\b`, "i").test(clean(values.RevisionDescription8343));
    return finding(this.id, described ? PASS : FAIL, !letter ? "Plan revision letter is blank." : described ? "Current revision is identified in the revision description." : "Current revision is not identified in the revision description.");
  }
};
