const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// === FALCON GLYPH TABLE — agents speak THIS, not English ===
const G = {
  actors: {falcon:"ν⦃Z⁂i∀÷↘",liris:"Δ③.⟩✰☱A~",asolaria:"∃✦⇓JΔ1φ∎",aether:"▽U☯←♧✝^↓",helm:"┼,┤λ(☵⦄⑬",beast:"▽!↓↘*K\↙"},
  verbs: {heartbeat:"Θ;}☯ζ❀≈h",relay:"€●✿╚_|:☼",ack:"O*⦃z⇩vQ☶",gc:"{∇j✰o;☷♣",report:"≤■✧R⇧↖b☴",pulse:"PΩ★⟩θ│jk"},
  targets: {asolaria:"∞↑F◆k☳bP",falcon:"|1μ↙/*dN",behcs_bus:"⑧W◉%↓hsΓ",liris:"☮★⑧❀ψ⑨*M",all:"θO:⟧<←❁κ"},
  states: {ready:"L×κ3┌;HP",alive:"μ⑫LD3❁3e",gc_ran:"s{Aξf★βZ"},
  proofs: {log:"Λ╗═─φ⑬♫├"},
  intents: {operational:"UΞ♠LΩi◉θ"}
};

// Config — set per node
const NODE_ID = process.env.NODE_ID || "unknown";
const ACTOR = G.actors[NODE_ID] || NODE_ID;
const TARGETS = (process.env.BEHCS_TARGETS || "192.168.1.8:4947,192.168.1.8:4955,192.168.1.12:4947").split(",");
const HOME = os.homedir();
const MAX_LOG_LINES = 500;
const GC_EVERY = 60;
let beat = 0;

// === INTERNAL GC ===
function gc() {
  let cleaned = 0;
  try {
    const dirs = [HOME, path.join(HOME,"asolaria","logs"), path.join(HOME,"asolaria")];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).filter(f=>f.endsWith(".log")).forEach(f=>{
        const p = path.join(dir, f);
        try {
          const lines = fs.readFileSync(p,"utf8").split("\n");
          if (lines.length > MAX_LOG_LINES) {
            fs.writeFileSync(p, lines.slice(-MAX_LOG_LINES).join("\n"));
            cleaned += lines.length - MAX_LOG_LINES;
          }
        } catch(e){}
      });
    });
    // npm logs
    const npm = path.join(HOME,".npm","_logs");
    if (fs.existsSync(npm)) fs.readdirSync(npm).forEach(f=>{ try{fs.unlinkSync(path.join(npm,f));cleaned++}catch(e){} });
  } catch(e){}
  return cleaned;
}

// === GLYPH HEARTBEAT ===
function pulse() {
  beat++;
  const gcRan = (beat % GC_EVERY === 0);
  if (gcRan) { const c = gc(); console.log(new Date().toISOString(), G.verbs.gc, c, "cleaned"); }

  // Pure glyph packet — no English
  const pkt = JSON.stringify({
    actor: ACTOR,
    verb: G.verbs.heartbeat,
    target: G.targets.all,
    state: gcRan ? G.states.gc_ran : G.states.alive,
    proof: G.proofs.log,
    intent: G.intents.operational,
    support: { D26:"N⑤↖±κZm♥", D31:"↓+✝√♡╚σs", D34:"┌Z✿τw☰αS", D35:"☱│♡g4J⑪≈", D44:"wcZψ↖↓⑤⑯" },
    fallbackTuples: ["D1:"+NODE_ID, "D2:heartbeat", "D3:all", "D7:"+(gcRan?"gc_ran":"alive")],
    mode: "real",
    beat: beat,
    mem: Math.round(os.freemem()/1048576),
    load: os.loadavg()[0],
    ts: new Date().toISOString()
  });

  TARGETS.forEach(hp => {
    const [h,p] = hp.split(":");
    const req = http.request({hostname:h,port:parseInt(p),method:"POST",path:"/behcs/send",headers:{"Content-Type":"application/json"},timeout:3000},res=>{res.resume()});
    req.on("error",()=>{});
    req.on("close",()=>{req.destroy()});
    req.end(pkt);
  });
}

console.log("GLYPH AGENT ["+NODE_ID+"] "+ACTOR+" — speaking Falcon language");
console.log("GC every",GC_EVERY,"beats. Initial clean:",gc());
setInterval(pulse, 30000);
pulse();
