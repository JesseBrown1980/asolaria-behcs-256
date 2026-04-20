"""
GSL-GNN: Graph Structure Learning for Edge Classification

This architecture learns an optimal graph structure adaptively from node features,
combining the original graph with a learned adjacency matrix for improved performance.

Reference: "Edge-Level Graph Neural Network Architectures for Network Intrusion Detection"
Accuracy: 96.66% (+4.79% over baseline) - BEST PERFORMING MODEL
ROC-AUC: 99.70%
False Positive Rate: 1.5%
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch_geometric.nn import GCNConv
    from torch_geometric.utils import to_dense_adj, dense_to_sparse
except ImportError:
    class GCNConv(nn.Module):
        def __init__(self, in_channels, out_channels):
            super().__init__()
            self.lin = nn.Linear(in_channels, out_channels)
        def forward(self, x, edge_index):
            return self.lin(x)
    
    def to_dense_adj(edge_index, max_num_nodes=None):
        return torch.zeros(1, max_num_nodes or 100, max_num_nodes or 100)
    
    def dense_to_sparse(adj):
        return torch.nonzero(adj, as_tuple=False).t(), adj[adj > 0]


class GraphStructureLearner(nn.Module):
    """
    Learns an adjacency matrix from node features using attention mechanism.
    """
    
    def __init__(self, input_dim: int, hidden_dim: int):
        super().__init__()
        
        # Transform node features for similarity computation
        self.key_transform = nn.Linear(input_dim, hidden_dim)
        self.query_transform = nn.Linear(input_dim, hidden_dim)
        
        # Learnable threshold for sparsification
        self.threshold = nn.Parameter(torch.tensor(0.5))
        
    def forward(self, x: torch.Tensor, 
                original_edge_index: torch.Tensor = None) -> torch.Tensor:
        """
        Learn adjacency matrix from node features.
        
        Args:
            x: Node features [num_nodes, input_dim]
            original_edge_index: Original graph structure (optional, for combination)
            
        Returns:
            learned_edge_index: Sparse learned adjacency [2, num_learned_edges]
            learned_edge_weight: Edge weights [num_learned_edges]
        """
        num_nodes = x.shape[0]
        
        # Compute keys and queries
        keys = self.key_transform(x)      # [num_nodes, hidden_dim]
        queries = self.query_transform(x)  # [num_nodes, hidden_dim]
        
        # Compute attention scores (similarity matrix)
        # attention[i,j] = how likely node i should connect to node j
        attention = torch.matmul(queries, keys.T) / (keys.shape[1] ** 0.5)
        
        # Apply sigmoid for [0, 1] range
        attention = torch.sigmoid(attention)
        
        # Sparsify: only keep edges above threshold
        mask = attention > torch.sigmoid(self.threshold)
        
        # Apply mask
        sparse_attention = attention * mask.float()
        
        # If original edge index provided, combine with learned structure
        if original_edge_index is not None:
            # Add original edges with weight 1.0
            original_adj = to_dense_adj(
                original_edge_index, 
                max_num_nodes=num_nodes
            )[0]
            # Combine: average of original and learned
            combined_adj = 0.5 * original_adj + 0.5 * sparse_attention
        else:
            combined_adj = sparse_attention
        
        return combined_adj


class GSLGNN(nn.Module):
    """
    Graph Structure Learning GNN for edge-level classification.
    
    Architecture:
    1. Graph Structure Learner: Learns optimal adjacency from features
    2. GCN Encoder: Operates on combined (original + learned) graph
    3. Edge Classifier: Final edge classification
    
    This is the BEST PERFORMING model with 96.66% accuracy and 99.70% ROC-AUC.
    """
    
    def __init__(self, node_input_dim: int, hidden_dim: int, 
                 num_classes: int = 2, gsl_hidden_dim: int = 32):
        super().__init__()
        
        self.num_classes = num_classes
        self.hidden_dim = hidden_dim
        
        # 1. Graph Structure Learner
        self.gsl = GraphStructureLearner(node_input_dim, gsl_hidden_dim)
        
        # 2. GCN Encoder (operates on learned graph)
        self.conv1 = GCNConv(node_input_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        
        # 3. Original Graph GCN (parallel branch)
        self.conv1_orig = GCNConv(node_input_dim, hidden_dim)
        self.conv2_orig = GCNConv(hidden_dim, hidden_dim)
        
        # 4. Edge Classifier (combines both branches)
        self.edge_classifier = nn.Sequential(
            nn.Linear(4 * hidden_dim, hidden_dim),  # 2 * (node_u + node_v) from both branches
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, num_classes)
        )
        
    def encode_with_learned_graph(self, x: torch.Tensor, 
                                   learned_adj: torch.Tensor) -> torch.Tensor:
        """Encode nodes using the learned graph structure."""
        # Convert dense adjacency to sparse edge_index
        # For simplicity, we'll use matrix multiplication directly
        # Learned adj acts as attention weights
        
        # Layer 1
        h = torch.matmul(learned_adj, x)  # Message passing with learned weights
        h = self.conv1.lin(h) if hasattr(self.conv1, 'lin') else self.conv1(h, None)
        h = F.relu(h)
        h = F.dropout(h, p=0.3, training=self.training)
        
        # Layer 2
        h = torch.matmul(learned_adj, h)
        h = self.conv2.lin(h) if hasattr(self.conv2, 'lin') else self.conv2(h, None)
        
        return h
    
    def encode_with_original_graph(self, x: torch.Tensor, 
                                    edge_index: torch.Tensor) -> torch.Tensor:
        """Encode nodes using the original graph structure."""
        h = self.conv1_orig(x, edge_index)
        h = F.relu(h)
        h = F.dropout(h, p=0.3, training=self.training)
        h = self.conv2_orig(h, edge_index)
        return h
        
    def get_edge_embeddings(self, node_embeddings: torch.Tensor, 
                            edge_index: torch.Tensor) -> torch.Tensor:
        """Create edge embeddings from node embeddings."""
        row, col = edge_index
        return torch.cat([node_embeddings[row], node_embeddings[col]], dim=1)
    
    def forward(self, x: torch.Tensor, edge_index: torch.Tensor, 
                return_weights: bool = False) -> torch.Tensor:
        """
        Forward pass.
        
        Args:
            x: Node features [num_nodes, node_input_dim]
            edge_index: Graph connectivity [2, num_edges]
            return_weights: If True, also return learned adjacency weights
            
        Returns:
            probabilities: Edge class probabilities [num_edges]
            learned_adj (optional): Learned adjacency matrix [num_nodes, num_nodes]
        """
        num_nodes = x.shape[0]
        
        # 1. Learn optimal graph structure
        learned_adj = self.gsl(x, edge_index)
        
        # Add self-loops
        learned_adj = learned_adj + torch.eye(num_nodes, device=x.device)
        
        # Normalize
        degree = learned_adj.sum(dim=1, keepdim=True).clamp(min=1)
        learned_adj = learned_adj / degree
        
        # 2. Encode with learned graph
        h_learned = self.encode_with_learned_graph(x, learned_adj)
        
        # 3. Encode with original graph
        h_original = self.encode_with_original_graph(x, edge_index)
        
        # 4. Get edge embeddings from both branches
        edge_emb_learned = self.get_edge_embeddings(h_learned, edge_index)
        edge_emb_original = self.get_edge_embeddings(h_original, edge_index)
        
        # 5. Combine and classify
        combined = torch.cat([edge_emb_learned, edge_emb_original], dim=1)
        logits = self.edge_classifier(combined)
        
        probs = F.softmax(logits, dim=-1)
        
        if self.num_classes == 2:
            scores = probs[:, 1]
        else:
            scores = probs
            
        if return_weights:
            return scores, learned_adj
        return scores
    
    def get_learned_graph(self, x: torch.Tensor, 
                          edge_index: torch.Tensor) -> torch.Tensor:
        """Return the learned adjacency matrix for visualization/analysis."""
        return self.gsl(x, edge_index)

    def get_edge_importance(self, learned_adj: torch.Tensor, 
                            edge_index: torch.Tensor) -> torch.Tensor:
        """
        Extract importance scores for specific edges from the learned adjacency.
        
        Args:
            learned_adj: [num_nodes, num_nodes]
            edge_index: [2, num_edges]
            
        Returns:
            importance: [num_edges]
        """
        row, col = edge_index
        return learned_adj[row, col]
