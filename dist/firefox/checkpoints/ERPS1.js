import { apps, applicationName, FAIL, finding, latestValidation, PASS, plan, recoveryLevel, REVIEW, sameDate } from "./shared.js";

export default {
  id: "ERPS1",
  title: "Plan dates match Recovery Plan Validations",
  validate(context) {
    const values = plan(context);
    const components = apps(context);
    const dateMap = { orientation: values.OrientationDate8341, tabletop: values.TableTopExerciseDate8336, drill: values.DrillDate8337, functional: values.FunctionalExerciseDate8338 };
    const mismatches = [];
    const missingEvidence = [];
    for (const [kind, headerDate] of Object.entries(dateMap)) {
      const applicable = kind === "functional"
        ? components.filter(component => [4, 5].includes(recoveryLevel(component)))
        : kind === "tabletop" || kind === "drill"
          ? components.filter(component => ![4, 5].includes(recoveryLevel(component)))
          : components;
      for (const component of applicable) {
        const row = latestValidation(context, component, kind);
        if (!headerDate) mismatches.push(`${kind} header date: ${applicationName(component)}`);
        else if (!row) missingEvidence.push(`${kind}: ${applicationName(component)}`);
        else if (!sameDate(headerDate, row.TestExerciseDate9527)) mismatches.push(`${kind}: ${applicationName(component)}`);
      }
    }
    return finding(
      this.id,
      mismatches.length ? FAIL : missingEvidence.length ? REVIEW : PASS,
      mismatches.length
        ? `Blank or mismatched validation dates were found for ${mismatches.join(", ")}.`
        : missingEvidence.length
          ? `Detailed validation evidence was not retrieved for ${missingEvidence.join(", ")}.`
          : "Header dates match the captured validation records."
    );
  }
};
