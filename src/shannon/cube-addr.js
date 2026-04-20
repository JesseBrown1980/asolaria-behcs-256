// Item 098 · 3x6x6 cube addressing per map-map-mapped feedback
// Axes: lens (3) × role (6 band) × stage (6 band) = 108 cells

const LENSES = ["signal", "structure", "seal"];
const ROLE_BANDS = ["R1-R2", "R3-R4", "R5-R6", "R7-R8", "R9-R10", "R11-R13"];
const STAGE_BANDS = ["S01-S04", "S05-S08", "S09-S12", "S13-S16", "S17-S20", "S21-S23"];

function addr({ lens, role_band, stage_band }) {
  const li = LENSES.indexOf(lens);
  const ri = ROLE_BANDS.indexOf(role_band);
  const si = STAGE_BANDS.indexOf(stage_band);
  if (li < 0 || ri < 0 || si < 0) return null;
  return `CUBE-${li}-${ri}-${si}`;
}

function fromIndices(l, r, s) {
  return `CUBE-${l}-${r}-${s}`;
}

function allAddresses() {
  const all = [];
  for (let l = 0; l < LENSES.length; l++) {
    for (let r = 0; r < ROLE_BANDS.length; r++) {
      for (let s = 0; s < STAGE_BANDS.length; s++) {
        all.push(fromIndices(l, r, s));
      }
    }
  }
  return all; // 108 cells
}

module.exports = { LENSES, ROLE_BANDS, STAGE_BANDS, addr, fromIndices, allAddresses };
