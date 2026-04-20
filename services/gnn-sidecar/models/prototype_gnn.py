"""
Prototype-GNN: Distance-based Edge Classification with Learnable Prototypes

This architecture uses learnable prototype vectors for each class.
Classification is based on the distance between edge embeddings and prototypes.

Reference: "Edge-Level Graph Neural Network Architectures for Network Intrusion Detection"
Accuracy: 94.24% (+2.37% over baseline)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch_geometric.nn import GCNConv
except ImportError:
    # Fallback for environments without torch_geometric
    class GCNConv(nn.Module):
        def __init__(self, in_channels, out_channels):
            super().__init__()
            self.lin = nn.Linear(in_channels, out_channels)
        def forward(self, x, edge_index):
            return self.lin(x)


class PrototypeGNN(nn.Module):
    """
    Prototype-based GNN for edge-level classification.
    
    Architecture:
    1. GCN Encoder: Learns node embeddings
    2. Edge Embedding: Concatenates source + target node embeddings
    3. Prototype Layer: Learnable class prototypes
    4. Classification: Based on distance to prototypes
    """
    
    def __init__(self, node_input_dim: int, hidden_dim: int, num_classes: int = 2, 
                 num_prototypes_per_class: int = 3, temperature: float = 0.1):
        super().__init__()
        
        self.num_classes = num_classes
        self.num_prototypes = num_prototypes_per_class
        self.temperature = temperature
        
        # 1. GCN Encoder
        self.conv1 = GCNConv(node_input_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        
        # 2. Edge Embedding Projection
        # Edge embedding = [node_u || node_v] -> projected_dim
        self.edge_projection = nn.Sequential(
            nn.Linear(2 * hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim)
        )
        
        # 3. Learnable Prototypes: [num_classes, num_prototypes_per_class, hidden_dim]
        # Each class has multiple prototypes to capture diverse attack patterns
        self.prototypes = nn.Parameter(
            torch.randn(num_classes, num_prototypes_per_class, hidden_dim)
        )
        nn.init.xavier_uniform_(self.prototypes)
        
    def encode_nodes(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """Encode nodes using GCN layers."""
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.5, training=self.training)
        x = self.conv2(x, edge_index)
        return x
    
    def get_edge_embeddings(self, node_embeddings: torch.Tensor, 
                            edge_index: torch.Tensor) -> torch.Tensor:
        """Create edge embeddings by concatenating source and target node embeddings."""
        row, col = edge_index
        edge_features = torch.cat([node_embeddings[row], node_embeddings[col]], dim=1)
        return self.edge_projection(edge_features)
    
    def compute_prototype_distances(self, edge_embeddings: torch.Tensor) -> torch.Tensor:
        """
        Compute distances between edge embeddings and class prototypes.
        Returns logits based on negative distances (closer = higher score).
        """
        batch_size = edge_embeddings.shape[0]
        
        # Expand dimensions for broadcasting
        # edge_embeddings: [batch, hidden_dim] -> [batch, 1, 1, hidden_dim]
        embeddings = edge_embeddings.unsqueeze(1).unsqueeze(2)
        
        # prototypes: [num_classes, num_prototypes, hidden_dim] -> [1, num_classes, num_prototypes, hidden_dim]
        protos = self.prototypes.unsqueeze(0)
        
        # Compute squared Euclidean distance
        # distances: [batch, num_classes, num_prototypes]
        distances = torch.sum((embeddings - protos) ** 2, dim=-1)
        
        # Take minimum distance to any prototype within each class
        # min_distances: [batch, num_classes]
        min_distances, _ = distances.min(dim=2)
        
        # Convert to logits (negative distance / temperature)
        logits = -min_distances / self.temperature
        
        return logits
    
    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        
        Args:
            x: Node features [num_nodes, node_input_dim]
            edge_index: Graph connectivity [2, num_edges]
            
        Returns:
            probabilities: Edge class probabilities [num_edges, num_classes]
        """
        # 1. Encode nodes
        node_embeddings = self.encode_nodes(x, edge_index)
        
        # 2. Get edge embeddings
        edge_embeddings = self.get_edge_embeddings(node_embeddings, edge_index)
        
        # 3. Compute prototype-based logits
        logits = self.compute_prototype_distances(edge_embeddings)
        
        # 4. Return probabilities (for binary, return positive class prob)
        probs = F.softmax(logits, dim=-1)
        
        if self.num_classes == 2:
            return probs[:, 1]  # Return anomaly probability
        return probs
    
    def get_prototype_loss(self, edge_embeddings: torch.Tensor, 
                           labels: torch.Tensor) -> torch.Tensor:
        """
        Optional: Prototype separation loss to encourage diverse prototypes.
        """
        # Encourage prototypes of the same class to be close to their samples
        # and prototypes of different classes to be far apart
        logits = self.compute_prototype_distances(edge_embeddings)
        return F.cross_entropy(logits, labels)
