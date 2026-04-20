// Item 108 · Product X · 87 IX-bucket namespace port (BEHCS-256-canonical)
// Names only; no device/brand data embedded.

const IX_BUCKETS = Object.freeze([
  // Acquisition (AQ-01..AQ-12)
  "AQ-01","AQ-02","AQ-03","AQ-04","AQ-05","AQ-06","AQ-07","AQ-08","AQ-09","AQ-10","AQ-11","AQ-12",
  // Transport (TR-01..TR-10)
  "TR-01","TR-02","TR-03","TR-04","TR-05","TR-06","TR-07","TR-08","TR-09","TR-10",
  // Decode (DE-01..DE-12)
  "DE-01","DE-02","DE-03","DE-04","DE-05","DE-06","DE-07","DE-08","DE-09","DE-10","DE-11","DE-12",
  // Parse (PA-01..PA-10)
  "PA-01","PA-02","PA-03","PA-04","PA-05","PA-06","PA-07","PA-08","PA-09","PA-10",
  // Validate (VA-01..PA-10)
  "VA-01","VA-02","VA-03","VA-04","VA-05","VA-06","VA-07","VA-08","VA-09","VA-10",
  // Patch (PT-01..PT-08)
  "PT-01","PT-02","PT-03","PT-04","PT-05","PT-06","PT-07","PT-08",
  // Verify (VF-01..VF-10)
  "VF-01","VF-02","VF-03","VF-04","VF-05","VF-06","VF-07","VF-08","VF-09","VF-10",
  // Audit (AU-01..AU-15)
  "AU-01","AU-02","AU-03","AU-04","AU-05","AU-06","AU-07","AU-08","AU-09","AU-10","AU-11","AU-12","AU-13","AU-14","AU-15",
]);

function ownsBucket(moduleName, bucketId) {
  const prefix = bucketId.slice(0, 2);
  const owners = { AQ: "acquire", TR: "transport", DE: "decode", PA: "parse", VA: "validate", PT: "patch", VF: "verify", AU: "audit" };
  return owners[prefix] === moduleName;
}

module.exports = { IX_BUCKETS, ownsBucket, TOTAL: IX_BUCKETS.length };
