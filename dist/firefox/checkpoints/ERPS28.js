import { apps, validateExercise } from "./shared.js";
export default { id: "ERPS28", title: "Orientation validation exists for every application", validate(context) { return validateExercise(context, this.id, "orientation", apps(context)); } };
