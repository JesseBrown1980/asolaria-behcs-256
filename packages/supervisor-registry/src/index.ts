export {
  SUPERVISOR_COMPILERS,
  listSupervisors,
  compileSupervisor,
  type SupervisorCorpus,
} from "./compile.ts";

export {
  summonSupervisor,
  refreshAllSupervisors,
  listCachedSupervisors,
  type SummonOptions,
  type SummonResult,
} from "./cache.ts";

export {
  ASOLARIA_ROOT,
  FEDERATION_ROOT,
  CANONICAL_DEVICES,
  loadDeviceRegistry,
  registerDevice,
  supervisorGlyphFor,
  eventStreamPathFor,
  type DeviceEntry,
  type DeviceRegistry,
} from "./device-registry.ts";

export {
  captureLocalScreen,
  probePeerStatus,
  typeToPeer,
  runLookTypeLookDecide,
  type CycleInput,
  type CycleResult,
  type PeerStatus,
} from "./look-type-look-decide.ts";

export {
  CANONICAL_HARDWARE,
  loadHardwareRegistry,
  enumerateLocalHardware,
  registerHardware,
  hwSupervisorGlyphFor,
  hwEventStreamPathFor,
  hwGlyphFromKind,
  snapshotTaskManager,
  runInteractiveTaskManager,
  type HardwareEntry,
  type HardwareKind,
  type HardwareRegistry,
  type TaskManagerSnapshot,
} from "./hardware-registry.ts";
