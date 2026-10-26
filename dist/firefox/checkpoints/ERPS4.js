import { FAIL, finding, normalize, PASS, plan, REVIEW } from "./shared.js";

export default {
  id: "ERPS4",
  title: "Organization matches an ESATS maintaining organization",
  validate(context) {
    const evidence = context.esatsEvidence?.applications || [];
    const available = evidence.filter(item => item.available);
    if (!available.length) return finding(this.id, REVIEW, context.esatsEvidence?.error || "ESATS maintaining-organization evidence is unavailable.");
    const erpsOrganization = normalize(plan(context).Organization8345);
    const erpsBusinessUnit = normalize(plan(context).BusinessUnit8344);
    const organizations = available.map(item => normalize(item.organization)).filter(Boolean);
    const businessUnits = available.map(item => normalize(item.businessUnit)).filter(Boolean);
    if (!organizations.length) return finding(this.id, REVIEW, "ESATS returned application data without a maintaining organization.");
    if (!organizations.includes(erpsOrganization)) return finding(this.id, FAIL, "ERPS Organization does not match an ESATS maintaining organization.");
    if (erpsBusinessUnit && businessUnits.length && !businessUnits.includes(erpsBusinessUnit)) return finding(this.id, FAIL, "ERPS Business Unit does not match the ESATS application evidence.");
    return finding(this.id, PASS, "ERPS Organization and available Business Unit evidence match ESATS.");
  }
};
