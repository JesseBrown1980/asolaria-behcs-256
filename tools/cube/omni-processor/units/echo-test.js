#!/usr/bin/env node
// echo-test-v0 unit: reads manifest from stdin, writes echo record to stdout, exits 0.
// Used by sandbox-runner self-test.

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => buf += c);
process.stdin.on('end', () => {
  let manifest;
  try { manifest = JSON.parse(buf); }
  catch (e) {
    process.stderr.write(JSON.stringify({ error: 'manifest_parse_failed', detail: e.message }));
    process.exit(2);
  }
  const message = (manifest.inputs && manifest.inputs.message) || '';
  const out = {
    unit_id: 'echo-test-v0',
    manifest_id: manifest.manifest_id,
    echoed: message,
    ts: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
});
