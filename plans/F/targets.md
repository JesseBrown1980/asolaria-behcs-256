# Item 076 · Drift broadcast · 8 targets

| Target | Logical name | Reach method | Canonical port |
|---|---|---|---|
| jesse  | jesse-operator    | keyboard + screen (acer's active session)        | N/A (operator) |
| rayssa | rayssa-operator   | keyboard + screen (liris host's active session) | N/A (operator) |
| amy    | amy-operator      | WhatsApp Web channel                              | N/A (operator) |
| felipe | felipe-operator   | SMS + A06 notification                            | N/A (operator) |
| liris  | liris-chief       | bus :4947/:4950 direct-wire                       | 4947/4950 |
| acer   | acer-namespace-coordinator | bus :4947 local                             | 4947 |
| beast  | beast-tts-bridge  | MQTT + AT modem relay                             | 1883 |
| falcon | falcon-front-end-kicker | adb input text + bus :4947                   | 4947 |

Broadcast order on CRITICAL: operators first (jesse, rayssa, amy, felipe), then nodes (liris, acer, beast, falcon).
