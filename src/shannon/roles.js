// Item 095 · 13-role profile loader

const ROLES = Object.freeze({
  R01: { id: "R01", name: "SIGNAL-SCOUT",        stages: ["S01","S02"], default_LCR: 0.6 },
  R02: { id: "R02", name: "GROUND-TRUTH-KEEPER", stages: ["S03","S04"], default_LCR: 0.7 },
  R03: { id: "R03", name: "REVERSE-GAIN-ANALYST",stages: ["S05"],       default_LCR: 0.7 },
  R04: { id: "R04", name: "OMNI-GNN-ANALYST",    stages: ["S06"],       default_LCR: 0.7 },
  R05: { id: "R05", name: "CONVERGENCE-JUDGE",   stages: ["S07","S09"], default_LCR: 0.75 },
  R06: { id: "R06", name: "POLYMORPHISM-GUARD",  stages: ["S08"],       default_LCR: 0.6 },
  R07: { id: "R07", name: "CADENCE-ADJUSTER",    stages: ["S10"],       default_LCR: 0.5 },
  R08: { id: "R08", name: "HALT-CANON-WATCHER",  stages: ["S11","S12"], default_LCR: 0.6 },
  R09: { id: "R09", name: "LENS-CALIBRATOR",     stages: ["S13","S14"], default_LCR: 0.7 },
  R10: { id: "R10", name: "RESONO-TWIN",         stages: ["S15","S16"], default_LCR: 0.6 },
  R11: { id: "R11", name: "SEAL-CHAIN-NOTARY",   stages: ["S17","S18","S19"], default_LCR: 0.8 },
  R12: { id: "R12", name: "TRACE-SCRIBE",        stages: ["S20"],       default_LCR: 0.9 },
  R13: { id: "R13", name: "CIVILIZATION-CHAIR",  stages: ["S21","S22"], default_LCR: 0.7 },
});

function roleForStage(stageId) {
  for (const role of Object.values(ROLES)) {
    if (role.stages.includes(stageId)) return role;
  }
  return null;
}

module.exports = { ROLES, roleForStage };
