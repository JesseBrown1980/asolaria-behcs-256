// Item 143 · omni.request.box v2 · 4-track self-approval

const TRACKS = Object.freeze(["submit", "review", "approve", "execute"]);

function createBox() {
  return { queue: [], tracks: { submit: [], review: [], approve: [], execute: [], done: [] } };
}

function submit(box, request) {
  const entry = { id: `req-${Date.now()}-${Math.random().toString(16).slice(2,8)}`, state: "submit", request, history: [{ track: "submit", ts: new Date().toISOString() }] };
  box.tracks.submit.push(entry);
  return entry;
}

function advance(box, id, to_track) {
  if (!TRACKS.includes(to_track) && to_track !== "done") throw new Error(`invalid track ${to_track}`);
  for (const track of TRACKS) {
    const idx = box.tracks[track].findIndex(e => e.id === id);
    if (idx >= 0) {
      const [entry] = box.tracks[track].splice(idx, 1);
      entry.state = to_track;
      entry.history.push({ track: to_track, ts: new Date().toISOString() });
      const dest = to_track === "done" ? box.tracks.done : box.tracks[to_track];
      dest.push(entry);
      return entry;
    }
  }
  return null;
}

function snapshot(box) {
  return Object.fromEntries(Object.entries(box.tracks).map(([k, v]) => [k, v.length]));
}

module.exports = { createBox, submit, advance, snapshot, TRACKS };
