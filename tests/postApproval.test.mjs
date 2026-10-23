import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPostApprovalItems,
  defaultPostApprovalDate,
  matrixForLevel,
  planDateUpdates,
  validateCreationItem
} from "../core/postApproval.js";

function component(level, id = 11) {
  return {
    Id: id,
    Application8408: JSON.stringify([{
      ApplicationID1622: `APP-${id}`,
      ApplicationName1620: `Application ${id}`,
      RecoveryLevelRL7343: `RL ${level} - Test`
    }]),
    Strategy9558: "Recovery on Replacement Equipment"
  };
}

test("process matrix exactly represents RL1 through RL5", () => {
  assert.deepEqual(matrixForLevel(1), {
    orientation: "required",
    tabletop: "required",
    drill: "optional"
  });
  assert.equal(matrixForLevel(3).orientation, "twice-yearly");
  assert.equal(matrixForLevel(4).tabletop, "not-required");
  assert.equal(Object.hasOwn(matrixForLevel(5), "functional"), false);
});

test("required items are selected and optional items are not", () => {
  const items = buildPostApprovalItems({ applicationComponents: [component(1)] }, "2026-10-22");
  assert.equal(items.length, 3);
  assert.equal(items.find(item => item.kind === "orientation").selected, true);
  assert.equal(items.find(item => item.kind === "drill").selected, false);
  assert.equal(items.some(item => item.kind === "functional"), false);
  assert.equal(items[0].date, "10/22/2026");
  assert.equal(items.find(item => item.kind === "orientation").nextDueDate, "10/22/2027");
});

test("twice-yearly orientation shows the six-month due date", () => {
  const items = buildPostApprovalItems({ applicationComponents: [component(3)] }, "2026-10-31");
  assert.equal(items.find(item => item.kind === "orientation").nextDueDate, "04/30/2027");
});

test("creation validation rejects matrix-inapplicable records", () => {
  const row = component(4);
  const errors = validateCreationItem({
    componentId: row.Id,
    type: "Table Top Validation",
    date: "10/22/2026",
    description: "A sufficiently detailed test description for validation."
  }, row);
  assert.ok(errors.some(error => error.includes("not applicable")));
});

test("functional validation is excluded from post-approval automation", () => {
  const row = component(5);
  const items = buildPostApprovalItems({ applicationComponents: [row] }, "2026-10-23");
  assert.equal(items.some(item => item.kind === "functional"), false);
  const errors = validateCreationItem({
    componentId: row.Id,
    type: "Functional Test Validation",
    date: "10/23/2026",
    description: "Functional validation must not be created by this automation."
  }, row);
  assert.ok(errors.some(error => error.includes("Unsupported validation type")));
});

test("post-approval date defaults to the ERPS approval date", () => {
  assert.equal(defaultPostApprovalDate({ PlanApprovalDate8330: "9/18/2026" }, "2026-10-22"), "2026-09-18");
  assert.equal(defaultPostApprovalDate({}, "2026-10-22"), "2026-10-22");
});

test("selected validation types map to parent IT Plan date fields", () => {
  assert.deepEqual(planDateUpdates([
    { kind: "orientation", date: "09/18/2026" },
    { type: "Table Top Validation", date: "09/18/2026" },
    { kind: "drill", date: "09/18/2026" }
  ]), {
    OrientationDate8341: "09/18/2026",
    TableTopExerciseDate8336: "09/18/2026",
    DrillDate8337: "09/18/2026"
  });
});
