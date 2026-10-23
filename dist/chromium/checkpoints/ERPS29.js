import { apps, recoveryLevel, validateExercise } from "./shared.js";
export default { id: "ERPS29", title: "Tabletop validation exists when required", validate(context) { return validateExercise(context, this.id, "tabletop", apps(context).filter(component => ![4, 5].includes(recoveryLevel(component)))); } };
