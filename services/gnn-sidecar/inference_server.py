import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import torch

from models.gnn_baseline import EdgeLevelGNN

MODEL = EdgeLevelGNN(6, 64)
_sd = torch.load(Path(__file__).with_name("baseline_model.pt"), map_location="cpu")
_sd = {(k.replace("conv1.lin.bias","conv1.bias").replace("conv2.lin.bias","conv2.bias") if k.endswith(".lin.bias") else k): v for k, v in _sd.items()}
MODEL.load_state_dict(_sd)
MODEL.eval()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_POST(self):
        try:
            if self.path != "/infer": raise ValueError("POST /infer only")
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            nodes, edges, edge_features = (payload[k] for k in ("nodes", "edges", "edge_features"))
            if any(len(x) != 6 for x in nodes) or any(len(x) != 2 for x in edges) or any(len(x) != 3 for x in edge_features) or len(edges) != len(edge_features): raise ValueError("expected nodes[*]=6, edges[*]=2, edge_features[*]=3")
            with torch.no_grad(): scores = MODEL(torch.tensor(nodes, dtype=torch.float32), torch.tensor(edges, dtype=torch.long).t().contiguous()).reshape(-1).tolist()
            body, code = {"scores": [float(v) for v in scores], "ok": True}, 200
        except Exception as ex:
            body, code = {"ok": False, "reason": str(ex)}, 400
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(body).encode())


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 4792), Handler).serve_forever()
