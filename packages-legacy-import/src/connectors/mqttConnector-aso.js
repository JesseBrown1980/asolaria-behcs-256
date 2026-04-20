/**
 * mqttConnector-aso.js — ASO-aware wrapper around mqttConnector.
 *
 * Re-exports every original export unchanged, except the key operational
 * functions which are wrapped with `withAso` so that invocations, successes,
 * and failures are automatically recorded in the ASO index.
 *
 * Also registers the MQTT broker as an ASO surface on load.
 */

const mqtt = require("./mqttConnector");
const { withAso, registerConnector } = require("../aso-connector-middleware");

// --- Register MQTT broker surfaces (localhost, three ports) ---
registerConnector("mqtt", "localhost", 18883);
registerConnector("mqtt", "localhost", 18884);
registerConnector("mqtt", "localhost", 18885);

// --- Wrap key operational functions with ASO telemetry ---
const wrappedPublishMqttMessage = withAso("mqtt", mqtt.publishMqttMessage);
const wrappedStartMqttBridge    = withAso("mqtt", mqtt.startMqttBridge);
const wrappedStopMqttBridge     = withAso("mqtt", mqtt.stopMqttBridge);
const wrappedSyncMqttBridge     = withAso("mqtt", mqtt.syncMqttBridge);

// --- Re-export everything, replacing wrapped functions ---
module.exports = {
  ...mqtt,
  publishMqttMessage: wrappedPublishMqttMessage,
  startMqttBridge:    wrappedStartMqttBridge,
  stopMqttBridge:     wrappedStopMqttBridge,
  syncMqttBridge:     wrappedSyncMqttBridge,
};
