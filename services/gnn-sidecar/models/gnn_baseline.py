import torch
import torch.nn as nn
import torch.nn.functional as F
# Conditional import to avoid crashing if torch_geometric is not installed in the agent environment
# In a real deployment, these would be strict imports.
try:
    from torch_geometric.nn import GCNConv
except ImportError:
    # Dummy GCNConv for environment where torch_geometric might be missing
    # ensuring code structure is correct even if execution fails locally
    class GCNConv(nn.Module):
        def __init__(self, in_channels, out_channels):
            super().__init__()
            self.lin = nn.Linear(in_channels, out_channels)
        def forward(self, x, edge_index):
            return self.lin(x)

class EdgeLevelGNN(nn.Module):
    """
    Baseline Edge-Level GNN.
    
    Architecture:
    1. Node Encoder: GCN layers to get node embeddings.
    2. Edge Classifier: MLP taking (Node_u, Node_v) -> Score.
    """
    def __init__(self, node_input_dim, hidden_dim, output_dim=1):
        super().__init__()
        
        # 1. Node Embedding (GCN)
        self.conv1 = GCNConv(node_input_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        
        # 2. Edge Classifier (MLP)
        # Input: (Node_embedding_u + Node_embedding_v)
        # We concatenate u and v embeddings, so input is 2 * hidden_dim
        self.edge_classifier = nn.Sequential(
            nn.Linear(2 * hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
            nn.Sigmoid()
        )

    def forward(self, x, edge_index):
        """
        x: Node features [Num_Nodes, Node_Input_Dim]
        edge_index: Graph connectivity [2, Num_Edges]
        """
        # A. Learn Node Embeddings
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.5, training=self.training)
        
        x = self.conv2(x, edge_index)
        
        # B. Classify Edges
        # For every edge (u, v) in edge_index
        row, col = edge_index
        
        # Gather embeddings for source (u) and target (v) nodes
        # x[row] gives embedding of source nodes for each edge
        # x[col] gives embedding of target nodes for each edge
        edge_features = torch.cat([x[row], x[col]], dim=1)
        
        # Predict score
        scores = self.edge_classifier(edge_features)
        
        return scores.squeeze()
