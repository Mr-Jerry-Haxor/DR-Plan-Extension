import test from "node:test";
import assert from "node:assert/strict";
import { runValidation } from "../core/validation.js";

const person = id => JSON.stringify([{ Id: id, BEMSID2122: `B${id}`, EmployeeStatus7331: "ACTIVE" }]);

function fixture() {
  const component = {
    Id: 1282,
    Application8408: JSON.stringify([{
      ApplicationID1622: "12988",
      ApplicationName1620: "TDRC Metrics",
      RecoveryTimeObjective1624: "576",
      RecoveryPointObjective1625: "24",
      RecoveryLevelRL7343: "RL 1 - Gradual Recovery",
      IsActive: true
    }]),
    ETTR9556: "576",
    ERP9557: "24",
    Strategy9558: "Recovery on Replacement Equipment"
  };
  return {
    plan: {
      Id: 803,
      PlanName7870: "TDRC Metrics",
      ParentFolder8435: "Application Recovery Plans",
      PlanOwner17919: person(1),
      PlanOwner28505: "[]",
      PlanApprovers7920: person(1),
      Purpose7948: "Recover the TDRC Metrics application after loss of the Quincy Data Center.",
      Scope7921: "TDRC Metrics at Quincy Data Center. Included are recovery resources. Excluded are infrastructure preparation steps.",
      Assumptions7949: "Backup and network services are available.",
      RecoveryStrategies7950: "Recover TDRC Metrics on replacement server and restore data from backup.",
      ActivationCriteria7951: "Loss of Quincy Data Center impacting TDRC Metrics.",
      ActivationProcedure7952: "The Team Leader will contact the Recovery Team.",
      OrientationDate8341: "10/22/2026",
      TableTopExerciseDate8336: "10/22/2026",
      DrillDate8337: "10/22/2026",
      FunctionalExerciseDate8338: "",
      PlanRevisionLetter8342: "O",
      RevisionDescription8343: "REV O: updated linked database."
    },
    recoveryTeams: [{ Id: 10 }],
    recoveryTeamMembers: [
      { RolePosition8347: "Team Leader", Members8349: person(1) },
      { RolePosition8347: "Team Leader Backup", Members8349: person(2) },
      { RolePosition8347: "Team Member", Members8349: person(3) }
    ],
    recoveryTasks: [
      { Sequence9446: "1", TaskCategory8362: "Recover TDRC Metrics servers", Description8363: "Recover on replacement equipment", StartHours8364: "0", Duration8365: "574", CumulativeHours8547: "574" },
      { Sequence9446: "2", TaskCategory8362: "Gather Recovery Team", Description8363: "Contact and assemble Recovery Team", StartHours8364: "574", Duration8365: "2", CumulativeHours8547: "576" },
      { Sequence9446: "3", TaskCategory8362: "TDRC Metrics recovered", Description8363: "Application recovered and available", StartHours8364: "576", Duration8365: "0", CumulativeHours8547: "576" }
    ],
    printableDocuments: [],
    nonPrintableDocuments: [{ Id: 1, DocumentName8376: "Certification" }],
    itServices: [], databases: [], hardware: [], servers: [],
    applicationComponents: [component],
    linkedByComponent: {
      1282: {
        services: [],
        applications: [{ Id: 1, AppID8696: "2", Application8657: JSON.stringify([{ ApplicationID1622: "2", ApplicationName1620: "Dependency", IsActive: true }]) }],
        databases: [{ Id: 1 }], servers: [{ Id: 1 }], hardware: [], recoveryTasks: []
      }
    },
    validations: [
      { TestExerciseType9526: "Orientation Validation", TestExerciseDate9527: "10/22/2026", ApplicationTestedExercised9582: "1282", Participants9530: JSON.stringify([{ Id: 1, BEMSID2122: "B1" }, { Id: 2, BEMSID2122: "B2" }, { Id: 3, BEMSID2122: "B3" }]), TestScenarioDescription9534: "Orientation completed for the application." },
      { TestExerciseType9526: "Table Top Validation", TestExerciseDate9527: "10/22/2026", ApplicationTestedExercised9582: "1282", Participants9530: "[]", TestScenarioDescription9534: "Tabletop completed for the application." },
      { TestExerciseType9526: "Drill Validation", TestExerciseDate9527: "10/22/2026", ApplicationTestedExercised9582: "1282", Participants9530: "[]", TestScenarioDescription9534: "Drill completed for the application." }
    ]
  };
}

test("validation always returns the authoritative 32 checkpoint IDs", () => {
  const report = runValidation(fixture());
  assert.equal(report.results.length, 32);
  assert.deepEqual(report.results.map(item => item.id), Array.from({ length: 32 }, (_, index) => `ERPS${index + 1}`));
  assert.equal(report.summary.total, 32);
});

test("reference-shaped fixture validates deterministic core rules", () => {
  const report = runValidation(fixture());
  const status = id => report.results.find(item => item.id === id).status;
  for (const id of ["ERPS3", "ERPS6", "ERPS7", "ERPS10", "ERPS11", "ERPS12", "ERPS13", "ERPS14", "ERPS15", "ERPS19", "ERPS20", "ERPS22", "ERPS23", "ERPS24", "ERPS26", "ERPS28", "ERPS29", "ERPS30", "ERPS32"]) {
    assert.equal(status(id), "PASS", `${id} should pass`);
  }
  assert.equal(status("ERPS25"), "NA");
  assert.equal(status("ERPS31"), "NA");
  assert.equal(status("ERPS4"), "REVIEW");
  assert.equal(status("ERPS5"), "REVIEW");
});

test("activation procedure without a responsible actor fails ERPS13", () => {
  const context = fixture();
  context.plan.ActivationProcedure7952 = "Contact the Recovery Team and assemble virtually.";
  const result = runValidation(context).results.find(item => item.id === "ERPS13");
  assert.equal(result.status, "FAIL");
});
