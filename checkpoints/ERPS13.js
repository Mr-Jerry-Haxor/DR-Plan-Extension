import { clean, FAIL, finding, PASS, plan } from "./shared.js";
export default {
  id: "ERPS13", title: "Activation procedure identifies recovery-team contact",
  validate(context) { const value = clean(plan(context).ActivationProcedure7952); const team = /recovery team|initial call list/i.test(value); const actor = /(?:plan owner|team lead(?:er)?|ITOC|MIM|manager|coordinator|consultant|author)\b.{0,40}\b(?:contact|notify|call|assemble)/i.test(value); return finding(this.id, team && actor ? PASS : FAIL, !team ? "Activation procedure does not contact the Recovery Team or Initial Call List." : !actor ? "Activation procedure does not identify who contacts the Recovery Team." : "Activation procedure identifies the contact path and responsible actor."); }
};
