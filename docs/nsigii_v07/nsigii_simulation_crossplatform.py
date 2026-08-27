#!/usr/bin/env python3
"""
NSIGII v0.7.0 Simulation - Cross-Platform Version
Bipolar Distributed Control System with Determinant Encoding

Author: Nnamdi Michael Okpala (OBINexus)
Date: 2026-02-07
"""

import numpy as np
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from enum import Enum

class BiPolarState(Enum):
    """Bipolar state machine states"""
    OPEN = "OPEN"
    ENTER = "ENTER"
    CLOSE = "CLOSE"
    EXIT = "EXIT"
    START = "START"
    STOP = "STOP"

class SensorMotorProfile(Enum):
    """Sensory-motor gain profiles"""
    HYPER = "HYPER"
    HYPO = "HYPO"
    BASELINE = "BASELINE"

class TruthValue(Enum):
    """Channel truth values"""
    ASSERTED = 1
    NEUTRAL = 0
    HELD = -1
    NULL = None

class NSIGIIv0_7:
    """
    NSIGII v0.7.0: Bipolar Distributed Control System
    Implements BiOrder/BiChaos encoding via determinant matrices
    """
    
    def __init__(self):
        self.state_sequence = []
        self.current_state = BiPolarState.START
        self.timestamp = datetime.now()
        
        # Suffering formalization parameters
        self.N = 0  # Needs
        self.R = 0  # Resources
        self.K = 0  # Constraint
        
        # Three-player chess positions
        self.self_controller = {"name": "SELF", "position": "HARD"}
        self.alice = {"name": "ALICE", "position": "SOFT", "known": True}
        self.bob = {"name": "BOB", "position": "SOFT", "known": False}
        
        # Sensory-motor profile
        self.profile = SensorMotorProfile.BASELINE
        
        # RWX permission vector
        self.permissions = {
            "READ": (1, 4),    # 001 = 1, <<2 = 4
            "WRITE": (4, 16),  # 100 = 4, <<2 = 16
            "EXECUTE": (16, 128)  # 10000 = 16, <<3 = 128
        }
        
        # Channel logic
        self.channels = {
            "c0": TruthValue.NEUTRAL,
            "c1": TruthValue.NEUTRAL,
            "c2": TruthValue.NEUTRAL
        }
        
        # Tennis scoring (state encoding)
        self.order_ratio = 8/13  # 0.62
        self.chaos_ratio = 5/13  # 0.38
        
        # Encoding matrices for determinant computation
        self.encoding_matrices = []
        
    def calculate_suffering(self) -> float:
        """
        Calculate suffering: Σ = (N - R) × K
        Returns normalized suffering value
        """
        sigma = (self.N - self.R) * self.K
        
        if self.R >= self.N:
            zone = "RESILIENT"
        elif self.K == 0:
            zone = "NEUTRAL"
        else:
            zone = "CATASTROPHIC"
            
        return {"sigma": sigma, "zone": zone, "N": self.N, "R": self.R, "K": self.K}
    
    def xor_encode(self, E_t: int, delta_t: int) -> int:
        """
        XOR encoding: δ_t = E_t ⊕ Δ_t
        Left shift persistence: Σ_t = (Σ_(t-1) << 1) | δ_t
        """
        delta = E_t ^ delta_t
        return delta
    
    def left_shift_persistence(self, prev_sum: int, delta: int) -> int:
        """Left shift persistence accumulation"""
        return (prev_sum << 1) | delta
    
    def rwx_vector(self) -> List[int]:
        """Calculate RWX permission vector"""
        return [4, 16, 128]  # [READ<<2, WRITE<<2, EXECUTE<<3]
    
    def bipolar_transition(self) -> BiPolarState:
        """
        Enforce alternating bipolar sequence: 2-1-2-1-2-1...
        OPEN(2) -> ENTER(1) -> CLOSE(2) -> EXIT(1) -> ...
        """
        transitions = {
            BiPolarState.START: BiPolarState.OPEN,
            BiPolarState.OPEN: BiPolarState.ENTER,
            BiPolarState.ENTER: BiPolarState.CLOSE,
            BiPolarState.CLOSE: BiPolarState.EXIT,
            BiPolarState.EXIT: BiPolarState.STOP,
            BiPolarState.STOP: BiPolarState.START
        }
        
        self.current_state = transitions.get(self.current_state, BiPolarState.START)
        self.state_sequence.append((self.current_state, datetime.now()))
        return self.current_state
    
    def create_encoding_matrix(self, order: float, chaos: float, ambiguity: int) -> np.ndarray:
        """
        Create encoding matrix for determinant-based encoding
        BiOrder-BiChaos-BiAmbiguity structure
        
        Matrix structure:
        [order,     chaos,      ambiguity]
        [chaos,     order,      -ambiguity]
        [ambiguity, -ambiguity, order-chaos]
        """
        matrix = np.array([
            [order, chaos, ambiguity],
            [chaos, order, -ambiguity],
            [ambiguity, -ambiguity, order - chaos]
        ])
        
        return matrix
    
    def encode_state_determinant(self, state_data: Dict) -> Dict:
        """
        Encode system state using determinant method
        
        BiOrder: structured, predictable components
        BiChaos: unpredictable, entropic components  
        BiAmbiguity: unresolved channels/states
        """
        # Extract BiOrder components
        order_components = [
            self.order_ratio,
            len([s for s in self.state_sequence if s[0] in [BiPolarState.OPEN, BiPolarState.ENTER]]) / max(len(self.state_sequence), 1),
            self.R / max(self.N, 1) if self.N > 0 else 1
        ]
        biorder = np.mean(order_components)
        
        # Extract BiChaos components
        chaos_components = [
            self.chaos_ratio,
            len([s for s in self.state_sequence if s[0] in [BiPolarState.CLOSE, BiPolarState.EXIT]]) / max(len(self.state_sequence), 1),
            self.K / max(self.K + 1, 1)
        ]
        bichaos = np.mean(chaos_components)
        
        # Extract BiAmbiguity (unresolved channels)
        biambiguity = len([ch for ch, val in self.channels.items() if val == TruthValue.NEUTRAL or val == TruthValue.NULL])
        
        # Create encoding matrix
        encoding_matrix = self.create_encoding_matrix(biorder, bichaos, biambiguity)
        
        # Calculate determinant
        determinant = np.linalg.det(encoding_matrix)
        
        # Store encoding
        self.encoding_matrices.append({
            "timestamp": datetime.now().isoformat(),
            "matrix": encoding_matrix.tolist(),
            "determinant": float(determinant),
            "biorder": float(biorder),
            "bichaos": float(bichaos),
            "biambiguity": int(biambiguity),
            "state": self.current_state.value
        })
        
        return {
            "encoding_matrix": encoding_matrix.tolist(),
            "determinant": float(determinant),
            "biorder": float(biorder),
            "bichaos": float(bichaos),
            "biambiguity": int(biambiguity),
            "interpretation": self._interpret_determinant(determinant, biorder, bichaos, biambiguity)
        }
    
    def _interpret_determinant(self, det: float, order: float, chaos: float, ambiguity: int) -> str:
        """Interpret the determinant value"""
        if abs(det) < 0.01:
            return "SINGULAR: System at critical collapse point - no unique solution"
        elif det > 0:
            if order > chaos:
                return f"STABLE ORDERED: det={det:.4f}, order dominates, low entropy"
            else:
                return f"UNSTABLE CHAOTIC: det={det:.4f}, chaos dominates, high entropy"
        else:  # det < 0
            if ambiguity > 1:
                return f"INVERTED AMBIGUOUS: det={det:.4f}, unresolved channels={ambiguity}, polarity reversed"
            else:
                return f"INVERTED: det={det:.4f}, negative determinant indicates polarity reversal"
    
    def decode_determinant(self, encoding_data: Dict) -> Dict:
        """
        Decode information from determinant encoding
        Uses inverse matrix when determinant != 0
        """
        matrix = np.array(encoding_data["encoding_matrix"])
        det = encoding_data["determinant"]
        
        if abs(det) < 1e-10:
            return {
                "status": "SINGULAR",
                "message": "Cannot decode - system at collapse point",
                "decoded_values": None
            }
        
        # Calculate inverse matrix
        try:
            inverse = np.linalg.inv(matrix)
            
            # Decode using inverse
            # Create a test vector representing system observables
            observable_vector = np.array([
                encoding_data["biorder"],
                encoding_data["bichaos"],
                encoding_data["biambiguity"]
            ])
            
            # Apply inverse to decode
            decoded = inverse @ observable_vector
            
            return {
                "status": "DECODED",
                "inverse_matrix": inverse.tolist(),
                "decoded_vector": decoded.tolist(),
                "original_biorder": encoding_data["biorder"],
                "original_bichaos": encoding_data["bichaos"],
                "original_biambiguity": encoding_data["biambiguity"],
                "decoded_interpretation": {
                    "component_0": f"Order component: {decoded[0]:.4f}",
                    "component_1": f"Chaos component: {decoded[1]:.4f}",
                    "component_2": f"Ambiguity component: {decoded[2]:.4f}"
                }
            }
        except np.linalg.LinAlgError:
            return {
                "status": "ERROR",
                "message": "Matrix inversion failed",
                "decoded_values": None
            }
    
    def here_and_now_detection(self) -> Dict:
        """
        Here-and-Now Protocol: All suffering detected NOW
        Space + Time invariant
        """
        suffering = self.calculate_suffering()
        
        return {
            "timestamp": datetime.now().isoformat(),
            "space_time": "HERE-NOW",
            "suffering_detected": suffering,
            "loop_back": suffering["sigma"] > 0,  # Loop back if suffering exists
            "invariant": "All suffering detected in present moment"
        }
    
    def channel_ambiguity_load(self) -> Dict:
        """
        Calculate ambiguity load: L ≈ |unresolved channels|
        'I love you' parsed differently in c₀ vs c₁
        """
        unresolved = [ch for ch, val in self.channels.items() 
                     if val in [TruthValue.NEUTRAL, TruthValue.NULL]]
        
        return {
            "unresolved_channels": unresolved,
            "ambiguity_load": len(unresolved),
            "interpretation": f"{len(unresolved)} channels carry unresolved meaning"
        }
    
    def run_simulation(self, steps: int = 10, needs: int = 10, resources: int = 7, constraint: float = 1.5):
        """Run a full system simulation"""
        print(f"\n{'='*80}")
        print(f"NSIGII v0.7.0 SIMULATION - {steps} steps")
        print(f"{'='*80}\n")
        
        self.N = needs
        self.R = resources
        self.K = constraint
        
        results = []
        
        for step in range(steps):
            print(f"\n--- STEP {step + 1} ---")
            
            # Transition state
            new_state = self.bipolar_transition()
            print(f"State: {new_state.value}")
            
            # Calculate suffering
            suffering = self.calculate_suffering()
            print(f"Suffering: Σ={suffering['sigma']:.2f} (Zone: {suffering['zone']})")
            
            # Update channels randomly for simulation
            import random
            for ch in self.channels:
                self.channels[ch] = random.choice(list(TruthValue))
            
            # Calculate ambiguity
            ambiguity = self.channel_ambiguity_load()
            print(f"Ambiguity Load: {ambiguity['ambiguity_load']} unresolved channels")
            
            # Encode state
            encoding = self.encode_state_determinant({"step": step})
            print(f"Determinant: {encoding['determinant']:.4f}")
            print(f"BiOrder: {encoding['biorder']:.4f}, BiChaos: {encoding['bichaos']:.4f}, BiAmbiguity: {encoding['biambiguity']}")
            print(f"Interpretation: {encoding['interpretation']}")
            
            # Decode
            decoded = self.decode_determinant(encoding)
            if decoded['status'] == 'DECODED':
                print(f"Decoded successfully: {decoded['decoded_interpretation']}")
            
            # Here-and-now detection
            here_now = self.here_and_now_detection()
            print(f"HERE-NOW Detection: Suffering={here_now['suffering_detected']['sigma']:.2f}, Loop={here_now['loop_back']}")
            
            results.append({
                "step": step + 1,
                "state": new_state.value,
                "suffering": suffering,
                "encoding": encoding,
                "decoded": decoded,
                "here_now": here_now
            })
        
        return results


if __name__ == "__main__":
    # Create instance and run simulation
    nsigii = NSIGIIv0_7()
    results = nsigii.run_simulation(steps=10, needs=10, resources=7, constraint=1.5)
    
    print(f"\n{'='*80}")
    print("SIMULATION COMPLETE")
    print(f"{'='*80}\n")
    
    # Determine output directory
    output_dir = Path.cwd()
    output_file = output_dir / 'nsigii_simulation_results.json'
    
    # Save results
    output = {
        "system": "NSIGII v0.7.0",
        "author": "Nnamdi Michael Okpala (OBINexus)",
        "date": "2026-02-07",
        "simulation_results": results,
        "encoding_matrices": nsigii.encoding_matrices
    }
    
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"Results saved to: {output_file}")
    print(f"\nTotal encoding matrices generated: {len(nsigii.encoding_matrices)}")
    print("\nTo analyze these results, run:")
    print("  python nsigii_determinant_decoder_crossplatform.py")
