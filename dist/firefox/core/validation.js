import { clean, result } from "./data.js";
import { CHECKPOINTS } from "../checkpoints/index.js";
import { FAIL, NA, PASS, REVIEW } from "../checkpoints/shared.js";

export { CHECKPOINTS };

export function runValidation(context) {
  const results = [];
  for (const checkpoint of CHECKPOINTS) {
    try {
      results.push(checkpoint.validate(context));
    } catch (error) {
      results.push(result(checkpoint.id, FAIL, error?.message || "Checkpoint validation failed."));
    }
  }
  const counts = Object.fromEntries(
    [PASS, FAIL, REVIEW, NA].map(status => [status, results.filter(item => item.status === status).length])
  );
  return {
    planId: context.plan?.Id,
    planName: clean(context.plan?.PlanName7870),
    generatedAt: new Date().toISOString(),
    results: CHECKPOINTS.map(checkpoint => ({
      id: checkpoint.id,
      title: checkpoint.title,
      ...(results.find(item => item.id === checkpoint.id) || result(checkpoint.id, REVIEW, "Checkpoint did not produce a result."))
    })),
    summary: { total: CHECKPOINTS.length, ...counts }
  };
}
