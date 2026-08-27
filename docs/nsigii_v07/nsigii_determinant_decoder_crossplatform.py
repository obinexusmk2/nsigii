#!/usr/bin/env python3
"""
NSIGII v0.7.0 Determinant Decoder - Cross-Platform Version
Advanced BiOrder/BiChaos/BiAmbiguity Analysis

Decodes encoded information using determinant matrix methods
Author: Nnamdi Michael Okpala (OBINexus)
Date: 2026-02-07
"""

import numpy as np
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import matplotlib.pyplot as plt
from datetime import datetime

class DeterminantDecoder:
    """
    Decodes NSIGII system states using determinant matrix analysis
    
    Key principles:
    1. BiOrder = Structured, predictable components (order ratio 8/13)
    2. BiChaos = Entropic, unpredictable components (chaos ratio 5/13)
    3. BiAmbiguity = Unresolved channels (semantic ambiguity load)
    4. Determinant encodes transformation properties
    """
    
    def __init__(self):
        self.golden_ratio = (1 + np.sqrt(5)) / 2  # φ ≈ 1.618
        self.order_chaos_balance = 8/13  # From tennis scoring
        
    def decode_determinant_signature(self, det: float, matrix: np.ndarray) -> Dict:
        """
        Decode the determinant signature to extract system properties
        
        Determinant properties:
        - det = 0: System singular, at collapse point
        - det > 0: Orientation preserved, stable
        - det < 0: Orientation inverted, polarity reversed
        - |det| = volume scaling factor
        """
        eigenvalues = np.linalg.eigvals(matrix)
        trace = np.trace(matrix)
        
        analysis = {
            "determinant": float(det),
            "magnitude": abs(det),
            "sign": "positive" if det > 0 else "negative" if det < 0 else "zero",
            "eigenvalues": eigenvalues.tolist(),
            "trace": float(trace),
            "condition_number": float(np.linalg.cond(matrix)) if abs(det) > 1e-10 else float('inf'),
            "is_singular": abs(det) < 1e-10,
            "volume_scaling": abs(det),
            "orientation": "preserved" if det > 0 else "reversed" if det < 0 else "collapsed"
        }
        
        # Analyze eigenvalues for stability
        real_parts = [e.real for e in eigenvalues]
        imag_parts = [e.imag for e in eigenvalues]
        
        analysis["stability"] = {
            "all_real": all(abs(e.imag) < 1e-10 for e in eigenvalues),
            "all_positive": all(e.real > 0 for e in eigenvalues),
            "max_eigenvalue": float(max(abs(e) for e in eigenvalues)),
            "spectral_radius": float(max(abs(e) for e in eigenvalues)),
            "dominant_mode": "stable" if all(e.real < 0 for e in eigenvalues) else "unstable"
        }
        
        return analysis
    
    def extract_biorder_bichaos(self, matrix: np.ndarray) -> Dict:
        """
        Extract BiOrder and BiChaos components from encoding matrix
        
        BiOrder components:
        - Diagonal dominance (stability)
        - Symmetry (reversibility)
        - Low condition number (well-conditioned)
        
        BiChaos components:
        - Off-diagonal magnitude (coupling)
        - Asymmetry (irreversibility)
        - High condition number (ill-conditioned)
        """
        diag = np.diag(matrix)
        off_diag = matrix - np.diag(diag)
        
        # Symmetry measure
        symmetry = np.linalg.norm(matrix - matrix.T) / np.linalg.norm(matrix)
        
        # Diagonal dominance
        diag_dom = np.mean([abs(diag[i]) / np.sum(abs(matrix[i, :])) for i in range(len(diag))])
        
        biorder_score = (1 - symmetry) * diag_dom
        bichaos_score = symmetry * (1 - diag_dom)
        
        return {
            "biorder_score": float(biorder_score),
            "bichaos_score": float(bichaos_score),
            "symmetry_measure": float(symmetry),
            "diagonal_dominance": float(diag_dom),
            "interpretation": self._interpret_scores(biorder_score, bichaos_score)
        }
    
    def _interpret_scores(self, order: float, chaos: float) -> str:
        """Interpret BiOrder/BiChaos scores"""
        ratio = order / (chaos + 1e-10)
        
        if ratio > 2:
            return "HIGHLY ORDERED: System dominated by structured, predictable dynamics"
        elif ratio > 1:
            return "ORDERED: Structure dominates with some chaotic elements"
        elif ratio > 0.5:
            return "BALANCED: Order and chaos in dynamic equilibrium"
        elif ratio > 0.25:
            return "CHAOTIC: Entropy dominates with some ordered structure"
        else:
            return "HIGHLY CHAOTIC: System dominated by unpredictable, entropic dynamics"
    
    def decode_ambiguity_channels(self, ambiguity_count: int, total_channels: int = 3) -> Dict:
        """
        Decode ambiguity load from unresolved channels
        
        Ambiguity increases semantic load and computational complexity
        'I love you' has different meanings in different channels (c₀, c₁, c₂)
        """
        ambiguity_ratio = ambiguity_count / total_channels
        
        semantic_load = {
            0: "CLEAR: All channels resolved, no ambiguity",
            1: "LOW: Single unresolved interpretation path",
            2: "HIGH: Multiple conflicting interpretations",
            3: "MAXIMAL: Complete semantic uncertainty"
        }
        
        return {
            "unresolved_channels": ambiguity_count,
            "total_channels": total_channels,
            "ambiguity_ratio": ambiguity_ratio,
            "semantic_load": semantic_load.get(ambiguity_count, "UNKNOWN"),
            "computational_cost": 2 ** ambiguity_count,  # Exponential in channels
            "interpretation_space": self._ambiguity_space(ambiguity_count)
        }
    
    def _ambiguity_space(self, count: int) -> str:
        """Describe the interpretation space"""
        if count == 0:
            return "Single deterministic interpretation"
        elif count == 1:
            return "Binary interpretation space (2 meanings)"
        elif count == 2:
            return "Quaternary interpretation space (4 meanings)"
        else:
            return f"2^{count} = {2**count} possible interpretations"
    
    def reconstruct_state_from_determinant(self, det: float, biorder: float, bichaos: float) -> Dict:
        """
        Reconstruct system state from determinant and BiOrder/BiChaos values
        
        Uses inverse problem solving: given det(M), can we recover M?
        Generally no unique solution, but can constrain state space
        """
        # Constraint analysis
        if abs(det) < 1e-10:
            state = "CRITICAL"
            description = "System at collapse point - no unique inverse exists"
        elif det > 0 and biorder > bichaos:
            state = "STABLE_ORDERED"
            description = "Positive determinant with order dominance - stable configuration"
        elif det > 0 and bichaos > biorder:
            state = "UNSTABLE_CHAOTIC"
            description = "Positive determinant with chaos dominance - unstable but preserving orientation"
        elif det < 0 and biorder > bichaos:
            state = "INVERTED_ORDERED"
            description = "Negative determinant with order dominance - ordered polarity reversal"
        else:
            state = "INVERTED_CHAOTIC"
            description = "Negative determinant with chaos dominance - chaotic polarity reversal"
        
        # Estimate system parameters
        volume_change = abs(det)
        polarity = "same" if det > 0 else "reversed"
        
        return {
            "state_classification": state,
            "description": description,
            "volume_scaling": volume_change,
            "polarity": polarity,
            "biorder_dominance": biorder > bichaos,
            "order_chaos_ratio": biorder / (bichaos + 1e-10),
            "stability_estimate": "stable" if (det > 0 and biorder > bichaos) else "unstable"
        }
    
    def xor_decode_sequence(self, encoded_sequence: List[int]) -> List[int]:
        """
        Decode XOR-encoded sequence
        δ_t = E_t ⊕ Δ_t can be reversed if we know one component
        """
        # For demonstration: assume first element is known
        if len(encoded_sequence) < 2:
            return encoded_sequence
        
        decoded = [encoded_sequence[0]]
        for i in range(1, len(encoded_sequence)):
            # XOR with previous to decode
            decoded.append(encoded_sequence[i] ^ encoded_sequence[i-1])
        
        return decoded
    
    def analyze_full_system(self, encoding_data: Dict) -> Dict:
        """
        Comprehensive analysis of NSIGII encoded state
        """
        matrix = np.array(encoding_data["matrix"])
        det = encoding_data["determinant"]
        biorder = encoding_data["biorder"]
        bichaos = encoding_data["bichaos"]
        biambiguity = encoding_data["biambiguity"]
        
        # Run all analyses
        det_analysis = self.decode_determinant_signature(det, matrix)
        order_chaos = self.extract_biorder_bichaos(matrix)
        ambiguity = self.decode_ambiguity_channels(biambiguity)
        state_reconstruction = self.reconstruct_state_from_determinant(det, biorder, bichaos)
        
        return {
            "timestamp": encoding_data.get("timestamp", datetime.now().isoformat()),
            "determinant_analysis": det_analysis,
            "biorder_bichaos_extraction": order_chaos,
            "ambiguity_analysis": ambiguity,
            "state_reconstruction": state_reconstruction,
            "summary": self._generate_summary(det_analysis, order_chaos, ambiguity, state_reconstruction)
        }
    
    def _generate_summary(self, det_analysis, order_chaos, ambiguity, state_recon) -> str:
        """Generate human-readable summary"""
        summary = f"""
NSIGII SYSTEM STATE SUMMARY
===========================

Determinant: {det_analysis['determinant']:.4f} ({det_analysis['sign']})
State: {state_recon['state_classification']}
{state_recon['description']}

BiOrder Score: {order_chaos['biorder_score']:.4f}
BiChaos Score: {order_chaos['bichaos_score']:.4f}
Balance: {order_chaos['interpretation']}

Ambiguity: {ambiguity['unresolved_channels']}/{ambiguity['total_channels']} channels unresolved
Semantic Load: {ambiguity['semantic_load']}
Interpretation Space: {ambiguity['interpretation_space']}

Volume Scaling: {det_analysis['volume_scaling']:.4f}x
Orientation: {det_analysis['orientation'].upper()}
Stability: {state_recon['stability_estimate'].upper()}
"""
        return summary.strip()


def visualize_encoding_space(encodings: List[Dict], output_file: str = "nsigii_encoding_space.png"):
    """
    Visualize the BiOrder-BiChaos-BiAmbiguity encoding space
    """
    fig = plt.figure(figsize=(16, 12))
    
    # Extract data
    biorders = [e['biorder'] for e in encodings]
    bichaos = [e['bichaos'] for e in encodings]
    biambiguities = [e['biambiguity'] for e in encodings]
    determinants = [e['determinant'] for e in encodings]
    
    # 1. BiOrder vs BiChaos scatter
    ax1 = fig.add_subplot(2, 3, 1)
    scatter1 = ax1.scatter(biorders, bichaos, c=determinants, s=100, cmap='RdYlGn', alpha=0.7)
    ax1.set_xlabel('BiOrder', fontsize=12, fontweight='bold')
    ax1.set_ylabel('BiChaos', fontsize=12, fontweight='bold')
    ax1.set_title('BiOrder vs BiChaos Space', fontsize=14, fontweight='bold')
    ax1.axline((0, 0), slope=1, color='gray', linestyle='--', alpha=0.5, label='Order=Chaos')
    ax1.legend()
    plt.colorbar(scatter1, ax=ax1, label='Determinant')
    ax1.grid(True, alpha=0.3)
    
    # 2. Determinant timeline
    ax2 = fig.add_subplot(2, 3, 2)
    ax2.plot(range(len(determinants)), determinants, 'o-', linewidth=2, markersize=8, color='darkblue')
    ax2.axhline(y=0, color='red', linestyle='--', linewidth=2, alpha=0.7, label='Singular Point')
    ax2.set_xlabel('Time Step', fontsize=12, fontweight='bold')
    ax2.set_ylabel('Determinant', fontsize=12, fontweight='bold')
    ax2.set_title('Determinant Evolution', fontsize=14, fontweight='bold')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # 3. Ambiguity load
    ax3 = fig.add_subplot(2, 3, 3)
    ax3.bar(range(len(biambiguities)), biambiguities, color=['green' if a == 0 else 'orange' if a == 1 else 'red' for a in biambiguities])
    ax3.set_xlabel('Time Step', fontsize=12, fontweight='bold')
    ax3.set_ylabel('Unresolved Channels', fontsize=12, fontweight='bold')
    ax3.set_title('BiAmbiguity Load', fontsize=14, fontweight='bold')
    ax3.set_ylim(0, 3.5)
    ax3.grid(True, alpha=0.3, axis='y')
    
    # 4. 3D scatter
    ax4 = fig.add_subplot(2, 3, 4, projection='3d')
    scatter4 = ax4.scatter(biorders, bichaos, biambiguities, c=determinants, s=100, cmap='RdYlGn', alpha=0.7)
    ax4.set_xlabel('BiOrder', fontsize=10, fontweight='bold')
    ax4.set_ylabel('BiChaos', fontsize=10, fontweight='bold')
    ax4.set_zlabel('BiAmbiguity', fontsize=10, fontweight='bold')
    ax4.set_title('3D Encoding Space', fontsize=14, fontweight='bold')
    plt.colorbar(scatter4, ax=ax4, label='Determinant', shrink=0.5)
    
    # 5. Order/Chaos ratio
    ax5 = fig.add_subplot(2, 3, 5)
    ratios = [o/(c+1e-10) for o, c in zip(biorders, bichaos)]
    ax5.plot(range(len(ratios)), ratios, 's-', linewidth=2, markersize=8, color='purple')
    ax5.axhline(y=1, color='black', linestyle='--', linewidth=2, alpha=0.7, label='Balanced')
    ax5.axhline(y=8/13, color='blue', linestyle='--', linewidth=2, alpha=0.7, label='Tennis Ratio')
    ax5.set_xlabel('Time Step', fontsize=12, fontweight='bold')
    ax5.set_ylabel('Order/Chaos Ratio', fontsize=12, fontweight='bold')
    ax5.set_title('Order-Chaos Balance', fontsize=14, fontweight='bold')
    ax5.legend()
    ax5.grid(True, alpha=0.3)
    
    # 6. Polarity (sign of determinant)
    ax6 = fig.add_subplot(2, 3, 6)
    polarities = [1 if d > 0 else -1 if d < 0 else 0 for d in determinants]
    colors = ['green' if p > 0 else 'red' if p < 0 else 'gray' for p in polarities]
    ax6.bar(range(len(polarities)), polarities, color=colors, alpha=0.7)
    ax6.set_xlabel('Time Step', fontsize=12, fontweight='bold')
    ax6.set_ylabel('Polarity', fontsize=12, fontweight='bold')
    ax6.set_title('System Polarity (sign of det)', fontsize=14, fontweight='bold')
    ax6.set_ylim(-1.5, 1.5)
    ax6.axhline(y=0, color='black', linestyle='-', linewidth=1)
    ax6.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Visualization saved to: {output_file}")
    return output_file


def find_input_file() -> Optional[Path]:
    """
    Find the simulation results file in current directory or script directory
    Cross-platform compatible
    """
    possible_names = [
        'nsigii_simulation_results.json',
        'NSIGII_simulation_results.json',
        'simulation_results.json'
    ]
    
    # Check current directory first
    cwd = Path.cwd()
    for name in possible_names:
        filepath = cwd / name
        if filepath.exists():
            return filepath
    
    # Check script directory
    script_dir = Path(__file__).parent
    for name in possible_names:
        filepath = script_dir / name
        if filepath.exists():
            return filepath
    
    return None


if __name__ == "__main__":
    print("\n" + "="*80)
    print("NSIGII v0.7.0 DETERMINANT DECODER - Cross-Platform Version")
    print("="*80 + "\n")
    
    # Find input file
    input_file = find_input_file()
    
    if input_file is None:
        print("ERROR: Could not find 'nsigii_simulation_results.json'")
        print("\nPlease ensure the file is in one of these locations:")
        print(f"  - Current directory: {Path.cwd()}")
        print(f"  - Script directory: {Path(__file__).parent}")
        print("\nOr run the simulation first to generate the file.")
        exit(1)
    
    print(f"Found input file: {input_file}")
    print()
    
    # Load simulation results
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    decoder = DeterminantDecoder()
    
    # Analyze each encoding
    print("Analyzing encoded states...\n")
    analyses = []
    
    for i, encoding_data in enumerate(data['encoding_matrices']):
        print(f"\n{'='*80}")
        print(f"ANALYSIS OF STEP {i+1}")
        print(f"{'='*80}")
        
        analysis = decoder.analyze_full_system(encoding_data)
        analyses.append(analysis)
        
        print(analysis['summary'])
        
        # Additional details
        print(f"\nEigenvalues: {[f'{e:.4f}' for e in analysis['determinant_analysis']['eigenvalues']]}")
        print(f"Condition Number: {analysis['determinant_analysis']['condition_number']:.4f}")
        print(f"Spectral Radius: {analysis['determinant_analysis']['stability']['spectral_radius']:.4f}")
    
    # Create visualization
    print(f"\n{'='*80}")
    print("Generating visualization...")
    print(f"{'='*80}\n")
    
    # Determine output directory (same as input file location)
    output_dir = input_file.parent
    viz_file = output_dir / 'nsigii_encoding_space.png'
    
    visualize_encoding_space(data['encoding_matrices'], str(viz_file))
    
    # Save full analysis
    output_analysis = {
        "system": "NSIGII v0.7.0 Determinant Decoder",
        "timestamp": datetime.now().isoformat(),
        "analyses": analyses
    }
    
    analysis_file = output_dir / 'nsigii_full_analysis.json'
    with open(analysis_file, 'w') as f:
        json.dump(output_analysis, f, indent=2, default=str)
    
    print(f"\nFull analysis saved to: {analysis_file}")
    print("\nDecoding complete!")
    print(f"\nOutput files saved in: {output_dir}")
