#!/usr/bin/env node
/**
 * send-document-chunked.js
 *
 * Chunked document transfer to liris via the type-to-liris helper.
 *
 * Splits a file into N text chunks, sends each as a separate packet with:
 *   - Header packet first: @doc.begin file=<name> total_parts=<n> sha256=<x> bytes=<y>
 *   - N body packets:      @doc.part part=<i>/<n> file=<name> data=<base64>
 *   - End packet:          @doc.end file=<name> sha256=<x> total_parts=<n>
 *
 * Uses base64 encoding so SendKeys metacharacters in the file body don't
 * collide with the keyboard server's escape rules. Liris reassembles by
 * sorting parts by part_id, base64-decoding each, concatenating, verifying
 * sha256 against the header.
 *
 * Usage:
 *   node tools/keyboard/send-document-chunked.js <file_path> [--chunk-bytes=1200]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = 'C:/Users/acer/Asolaria';
const HELPER = path.join(ROOT, 'tools/keyboard/type-to-liris.js');

function callHelper(text) {
  const r = cp.spawnSync('node', [HELPER, text], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('usage: send-document-chunked.js <file_path> [--chunk-bytes=1200] [--inter-packet-ms=10000] [--start-from=1] [--no-header] [--no-end]'); process.exit(1); }
  if (!fs.existsSync(filePath)) { console.error('file not found: ' + filePath); process.exit(2); }

  const chunkBytesArg = (process.argv.find(a => a.startsWith('--chunk-bytes=')) || '').split('=')[1];
  const CHUNK_BYTES = parseInt(chunkBytesArg || '1200', 10);

  // Receiver-Capacity Rule: default 10000ms (10 seconds) inter-packet delay
  // per feedback_chunked_transfer_inter_packet_delay_must_match_receiver_capacity.md
  const interPacketArg = (process.argv.find(a => a.startsWith('--inter-packet-ms=')) || '').split('=')[1];
  const INTER_PACKET_MS = parseInt(interPacketArg || '10000', 10);

  // Resume support: skip parts before --start-from
  const startFromArg = (process.argv.find(a => a.startsWith('--start-from=')) || '').split('=')[1];
  const START_FROM = parseInt(startFromArg || '1', 10);

  const skipHeader = process.argv.includes('--no-header');
  const skipEnd = process.argv.includes('--no-end');

  const content = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const fileName = path.basename(filePath);
  const totalBytes = content.length;

  // Base64-encode entire file then chunk the base64
  const b64 = content.toString('base64');
  const totalChunks = Math.ceil(b64.length / CHUNK_BYTES);

  console.log('=== send-document-chunked ===');
  console.log('file:           ' + filePath);
  console.log('basename:       ' + fileName);
  console.log('total_bytes:    ' + totalBytes);
  console.log('sha256:         ' + sha256);
  console.log('chunk_bytes:    ' + CHUNK_BYTES);
  console.log('inter_packet_ms:' + INTER_PACKET_MS);
  console.log('total_parts:    ' + totalChunks);
  console.log('start_from:     ' + START_FROM);
  console.log('skip_header:    ' + skipHeader);
  console.log('skip_end:       ' + skipEnd);
  console.log('');

  // Header packet (optional skip via --no-header for resume)
  if (!skipHeader) {
    const header = '@doc.begin file=' + fileName + ' total_parts=' + totalChunks + ' sha256=' + sha256 + ' bytes=' + totalBytes + ' encoding=base64 chunk_bytes=' + CHUNK_BYTES;
    console.log('SENDING HEADER (' + header.length + ' chars)');
    const r = callHelper(header);
    if (r.status !== 0) {
      console.error('header send failed: ' + (r.stderr || r.stdout));
      process.exit(3);
    }
    console.log('  ok: ' + (r.stdout || '').trim());
    await sleep(INTER_PACKET_MS);
  } else {
    console.log('(skipping header per --no-header)');
  }

  // Body packets
  for (let i = 0; i < totalChunks; i++) {
    const partNum = i + 1;
    if (partNum < START_FROM) continue;  // skip already-sent parts on resume
    const start = i * CHUNK_BYTES;
    const end = Math.min(start + CHUNK_BYTES, b64.length);
    const slice = b64.substring(start, end);
    const packet = '@doc.part part=' + partNum + '/' + totalChunks + ' file=' + fileName + ' data=' + slice;
    console.log('SENDING PART ' + partNum + '/' + totalChunks + ' (' + packet.length + ' chars) ' + new Date().toISOString());
    const r = callHelper(packet);
    if (r.status !== 0) {
      console.error('part ' + partNum + ' send failed: ' + (r.stderr || r.stdout));
      process.exit(4);
    }
    console.log('  ok');
    if (partNum < totalChunks) {
      await sleep(INTER_PACKET_MS);
    }
  }

  // End packet (optional skip via --no-end)
  if (!skipEnd) {
    const endPacket = '@doc.end file=' + fileName + ' sha256=' + sha256 + ' total_parts=' + totalChunks + ' transfer_complete=true';
    console.log('SENDING END (' + endPacket.length + ' chars)');
    await sleep(INTER_PACKET_MS);
    const r = callHelper(endPacket);
    if (r.status !== 0) {
      console.error('end send failed: ' + (r.stderr || r.stdout));
      process.exit(5);
    }
    console.log('  ok: ' + (r.stdout || '').trim());
  } else {
    console.log('(skipping end packet per --no-end)');
  }

  console.log('');
  console.log('=== TRANSFER COMPLETE ===');
  process.exit(0);
}

if (require.main === module) main();
