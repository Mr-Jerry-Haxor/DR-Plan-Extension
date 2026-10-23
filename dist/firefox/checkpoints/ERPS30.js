import { apps, recoveryLevel, validateExercise } from "./shared.js";
export default { id: "ERPS30", title: "Drill validation exists when required", validate(context) { return validateExercise(context, this.id, "drill", apps(context).filter(component => ![4, 5].includes(recoveryLevel(component)))); } };
