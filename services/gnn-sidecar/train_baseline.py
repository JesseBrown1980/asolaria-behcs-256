#!/usr/bin/env python3
"""
GNN Baseline Training — Phase 10
Trains EdgeLevelGNN on Asolaria's graph runtime events.
Uses the exported PyTorch Geometric compatible dataset from src/gnnDataExport.js.
"""
import json
import sys
import os
import numpy as np

# Add models to path
sys.path.insert(0, os.path.dirname(__file__))

def load_asolaria_dataset(path):
    """Load the exported training data from gnnDataExport.js"""
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Loaded: {data['stats']['totalEdges']} edges, {data['stats']['totalNodes']} nodes")
    print(f"Benign: {data['stats']['benign']}, Suspicious: {data['stats']['suspicious']}")
    print(f"Label ratio: {data['stats']['labelRatio']}")

    return data

def build_node_features(nodes):
    """Convert node dicts to feature matrix"""
    # Features: edgeVolume, avgRisk, maxRisk, failureRate, online, trustTier
    features = []
    for node in nodes:
        features.append([
            min(node.get('edgeVolume', 0) / 100.0, 1.0),  # normalize
            node.get('avgRisk', 0) / 9.0,
            node.get('maxRisk', 0) / 9.0,
            node.get('failureRate', 0),
            node.get('online', 1),
            node.get('trustTier', 1) / 3.0
        ])
    return np.array(features, dtype=np.float32)

def build_edge_features_and_labels(edges):
    """Convert edge dicts to feature matrix and labels"""
    features = []
    labels = []
    for edge in edges:
        features.append([
            edge.get('riskScore', 0) / 9.0,
            1.0 if edge.get('isMutation', 0) else 0.0,
            1.0 if edge.get('crossDomain', 0) else 0.0,
        ])
        labels.append(edge.get('label', 0))
    return np.array(features, dtype=np.float32), np.array(labels, dtype=np.float32)

def build_edge_index(data):
    """Build adjacency from edge list"""
    node_map = {n['id']: i for i, n in enumerate(data['nodes'])}
    sources = []
    targets = []
    for edge in data['edges']:
        src = node_map.get(edge['source'], 0)
        tgt = node_map.get(edge['target'], 0)
        sources.append(src)
        targets.append(tgt)
    return np.array([sources, targets], dtype=np.int64)

def train_baseline(dataset_path, epochs=50):
    """Train EdgeLevelGNN baseline"""
    try:
        import torch
        import torch.nn as nn
        from models.gnn_baseline import EdgeLevelGNN
    except ImportError as e:
        print(f"PyTorch not available: {e}")
        print("Install: pip install torch torch_geometric")
        print("Generating shadow-mode evaluation report instead...")
        return evaluate_heuristic(dataset_path)

    data = load_asolaria_dataset(dataset_path)

    # Build tensors
    node_features = torch.tensor(build_node_features(data['nodes']))
    edge_index = torch.tensor(build_edge_index(data))
    _, labels = build_edge_features_and_labels(data['edges'])
    labels = torch.tensor(labels)

    # Split: 70/15/15 temporal
    n = len(labels)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)

    # Model
    model = EdgeLevelGNN(node_input_dim=node_features.shape[1], hidden_dim=64)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)
    criterion = nn.BCELoss()

    print(f"\nTraining EdgeLevelGNN: {node_features.shape[0]} nodes, {n} edges, {epochs} epochs")
    print(f"Split: train={train_end}, val={val_end-train_end}, test={n-val_end}")

    # Train
    best_val_acc = 0
    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        out = model(node_features, edge_index)
        loss = criterion(out[:train_end], labels[:train_end])
        loss.backward()
        optimizer.step()

        # Validate
        model.eval()
        with torch.no_grad():
            pred = (model(node_features, edge_index) > 0.5).float()
            val_acc = (pred[train_end:val_end] == labels[train_end:val_end]).float().mean().item()
            if val_acc > best_val_acc:
                best_val_acc = val_acc

        if (epoch + 1) % 10 == 0:
            print(f"  Epoch {epoch+1}: loss={loss.item():.4f}, val_acc={val_acc:.4f}")

    # Test
    model.eval()
    with torch.no_grad():
        pred = (model(node_features, edge_index) > 0.5).float()
        test_acc = (pred[val_end:] == labels[val_end:]).float().mean().item()
        test_pred = pred[val_end:]
        test_labels = labels[val_end:]
        tp = ((test_pred == 1) & (test_labels == 1)).sum().item()
        fp = ((test_pred == 1) & (test_labels == 0)).sum().item()
        fn = ((test_pred == 0) & (test_labels == 1)).sum().item()
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    print(f"\n=== Test Results ===")
    print(f"Accuracy: {test_acc:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1: {f1:.4f}")
    print(f"Best val acc: {best_val_acc:.4f}")

    # Save model
    model_path = os.path.join(os.path.dirname(__file__), 'baseline_model.pt')
    torch.save(model.state_dict(), model_path)
    print(f"Model saved: {model_path}")

    return {"accuracy": test_acc, "precision": precision, "recall": recall, "f1": f1}

def evaluate_heuristic(dataset_path):
    """Evaluate heuristic scoring (shadow mode baseline)"""
    data = load_asolaria_dataset(dataset_path)

    correct = 0
    total = len(data['edges'])
    tp = fp = fn = tn = 0

    for edge in data['edges']:
        pred = 1 if edge.get('riskScore', 0) >= 6 else 0
        actual = edge.get('label', 0)
        if pred == actual:
            correct += 1
        if pred == 1 and actual == 1: tp += 1
        if pred == 1 and actual == 0: fp += 1
        if pred == 0 and actual == 1: fn += 1
        if pred == 0 and actual == 0: tn += 1

    accuracy = correct / total if total else 0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    print(f"\n=== Heuristic Baseline (shadow mode) ===")
    print(f"Total: {total}, TP={tp}, FP={fp}, FN={fn}, TN={tn}")
    print(f"Accuracy: {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1: {f1:.4f}")

    return {"mode": "heuristic_shadow", "accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1}

if __name__ == "__main__":
    dataset_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'gnn-training-export-20260315.json')
    if not os.path.exists(dataset_path):
        print(f"Dataset not found: {dataset_path}")
        print("Run: node -e \"require('./src/gnnDataExport').saveTrainingExport('data/gnn-training-export-20260315.json')\"")
        sys.exit(1)

    train_baseline(dataset_path)
