#!/usr/bin/env node
/**
 * aerial-watchdog.js — keeps all phones connected via WiFi ADB.
 * Every 30s checks each phone. If disconnected, reconnects.
 * No USB needed. Phones stay aerial permanently.
 *
 * Cube: D15 DEVICE (103823) + D44 HEARTBEAT (7189057)
 */
'use strict';
const { execSync } = require('child_process');
const ADB = 'C:/Users/acer/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb';

const PHONES = [
  { name: 'falcon',  ip: '192.168.1.9',  port: 5555, serial: 'R5CXA4MGQXV', model: 'SM-S721U1' },
  { name: 'felipe',  ip: '192.168.1.10', port: 5555, serial: 'R9QY205KAKJ', model: 'SM-A065M' },
];

let cycle = 0;

function check() {
  cycle++;
  let devices;
  try { devices = execSync(`"${ADB}" devices`, { encoding: 'utf8', timeout: 5000 }); }
  catch (_) { console.log(`[aerial] #${cycle} ADB server dead — restarting`); try { execSync(`"${ADB}" start-server`, { timeout: 10000 }); } catch (_) {} return; }

  for (const phone of PHONES) {
    const addr = `${phone.ip}:${phone.port}`;
    const connected = devices.includes(addr) && !devices.includes(addr + '\toffline');
    if (!connected) {
      console.log(`[aerial] #${cycle} ${phone.name} DISCONNECTED — reconnecting ${addr}`);
      try { execSync(`"${ADB}" connect ${addr}`, { encoding: 'utf8', timeout: 10000 }); console.log(`[aerial] #${cycle} ${phone.name} RECONNECTED`); }
      catch (e) { console.log(`[aerial] #${cycle} ${phone.name} FAILED: ${e.message.slice(0, 80)}`); }
    } else if (cycle % 4 === 1) {
      console.log(`[aerial] #${cycle} ${phone.name} ALIVE at ${addr}`);
    }
  }
}

console.log('[aerial-watchdog] Starting — keeping phones connected via WiFi ADB');
PHONES.forEach(p => console.log(`  ${p.name}: ${p.ip}:${p.port} (${p.model})`));
console.log('');
check();
setInterval(check, 30000);
