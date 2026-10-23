import { finding, REVIEW } from "./shared.js";
export default { id: "ERPS4", title: "Organization matches an ESATS maintaining organization", validate() { return finding(this.id, REVIEW, "ESATS maintaining-organization evidence is not available in the ERPS response."); } };
