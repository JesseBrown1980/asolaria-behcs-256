// @asolaria/shannon-civ — Section G runtime.
//
// Studies attack, ships defense. 13 agent profiles + 7-layer immune wiring.
// Workers run on acer civilization; liris owns L0-L2 gates + L6 synthesis.

export {
  SHANNON_AGENT_NAMES,
  SHANNON_PHASES,
  SHANNON_MODELS,
  SHANNON_AUTONOMY,
  CANONICAL_PROFILES,
  validateProfile,
  validateSpawnRequest,
  type ShannonAgentName,
  type ShannonPhase,
  type ShannonModel,
  type ShannonAutonomy,
  type ShannonProfile,
  type SpawnRequest,
  type ValidateResult,
  type Violation,
  type ViolationKind,
} from "./profile-schema.ts";

export {
  L0_reflex,
  L1_skin,
  L2_innate,
  runL0ToL2,
  type ImmuneLevel,
  type ImmuneVerdict,
  type L0Input,
  type L2Input,
  type FullCheckInput,
  type FullCheckResult,
} from "./immune-wiring.ts";

export {
  dispatchScan,
  scanStorePath,
  SCAN_STORE_ROOT_DEFAULT,
  type ScanPhase,
  type ScanStoreRecord,
  type DispatchOptions,
  type DispatchResult,
} from "./scan-dispatcher.ts";

export {
  synthesizeFromScanLog,
  saveReport,
  reportPath,
  REPORTS_ROOT_DEFAULT,
  type SynthesizedReport,
} from "./synthesis-report.ts";
