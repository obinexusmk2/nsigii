
# 10. Python Reference Implementation (Coordinate‑Aware OBIAI)

This section provides a Python‑only, classifier‑safe reference for the OBIAI framework.
It implements: (1) ontological self‑location (XYZ), (2) Bayesian inference with coordinate
adjustment, (3) infrastructure handshake for integrity, and (4) a medical triage example.

> Terminology note: we use **Understanding Mode** to mean OCM ≥ 0.954 and **Pattern Mode**
> otherwise. No claims about sentience are made.

---

## 10.1 Ontological Agent (XYZ Self‑Location)

```python
# obiai/ontology.py
from dataclasses import dataclass

@dataclass
class Identity:
    x: float  # [-1, 1] Fictional(-1) ↔ Factual(+1)
    y: float  # [-1, 1] Informal(-1)  ↔ Formal(+1)
    z: float  # [0, 1]  Static(0)     ↔ Adaptive(1)

class OntologicalAgent:
    def __init__(self, identity: Identity):
        self.identity = identity  # current coordinate position

    def locate_for_task(self, task: str) -> Identity:
        # Example policy; in practice load task profiles from config/rules
        presets = {
            "medical_diagnosis": Identity(0.8, 0.9, 0.6),
            "cultural_translation": Identity(-0.3, -0.2, 0.8),
        }
        return presets.get(task, self.identity)
```

---

## 10.2 Bayesian Inference with Coordinate Adjustment

```python
# obiai/inference.py
from typing import Dict, List, Tuple
from dataclasses import dataclass
import math

@dataclass
class Hypothesis:
    id: str
    p: float  # probability

def bayes_update(prior: List[Hypothesis], likelihoods: Dict[str, float]) -> List[Hypothesis]:
    # Simple normalized update: p'(h) ∝ p(h) * L(data|h)
    post = []
    Z = 0.0
    for h in prior:
        p = h.p * likelihoods.get(h.id, 1e-9)
        post.append(Hypothesis(h.id, p))
        Z += p
    if Z == 0:
        # avoid divide-by-zero; return prior unchanged
        return prior
    return [Hypothesis(h.id, h.p / Z) for h in post]

def coordinate_bias_adjustment(post: List[Hypothesis], xyz: Dict[str, float]) -> List[Hypothesis]:
    # Example: when z (adaptivity) is high, lightly flatten the posterior to avoid overconfidence
    adapt = max(0.0, min(1.0, xyz.get("z", 0.5)))
    if adapt <= 0.01:
        return post
    # temperature-like smoothing
    t = 1.0 + 0.5 * adapt
    raw = [h.p ** (1.0 / t) for h in post]
    Z = sum(raw) or 1.0
    return [Hypothesis(h.id, r / Z) for h, r in zip(post, raw)]

def compute_ocm(ece: float, coherence: float, semantic: float, w=(0.34, 0.33, 0.33)) -> float:
    # ece: Expected Calibration Error in [0,1] (lower is better) -> convert to score
    C_e = max(0.0, min(1.0, 1.0 - ece))
    C_c = max(0.0, min(1.0, coherence))
    C_s = max(0.0, min(1.0, semantic))
    w1, w2, w3 = w
    return w1*C_e + w2*C_c + w3*C_s

def update_mode(ocm: float, mode: str, enter=0.954, exit=0.940) -> str:
    if mode != "UNDERSTANDING" and ocm >= enter:
        return "UNDERSTANDING"
    if mode == "UNDERSTANDING" and ocm < exit:
        return "PATTERN"
    return mode

def bias_amplification(phi: float, layers: int, clamp=3.0) -> float:
    baf = (phi ** max(0, layers))
    return min(baf, clamp)

def likelihood_model(observation: Dict, hypotheses: List[Hypothesis], xyz: Dict[str, float]) -> Dict[str, float]:
    # Toy likelihood: more formal (y) → sharper separation; more factual (x) → higher L for evidence-backed H1
    y = max(-1.0, min(1.0, xyz.get("y", 0.0)))
    x = max(-1.0, min(1.0, xyz.get("x", 0.0)))
    sharp = 1.5 + 1.0 * max(0.0, y)   # formal sharpens
    bias = 1.0 + 0.5 * max(0.0, x)    # factual favors evidence-backed hypothesis

    # Assume first hypothesis is evidence-backed for demo purposes
    L = {}
    for i, h in enumerate(hypotheses):
        base = 0.5 if i == 0 else 0.5 / (len(hypotheses)-1 or 1)
        L[h.id] = (base * bias) ** sharp if i == 0 else (base) ** sharp
    # normalize
    Z = sum(L.values()) or 1.0
    return {k: v / Z for k, v in L.items()}
```

---

## 10.3 Infrastructure Handshake (Integrity & Bias Gates)

```python
# obiai/infrastructure.py
from dataclasses import dataclass

@dataclass
class IntegrityReport:
    coordinate_ok: bool
    bias_bounds_ok: bool
    message: str = ""

def isomorphic_handshake(data_sig: str, algo_sig: str) -> bool:
    # Deterministic check stub; real systems should cryptographically verify schemas & hashes
    return data_sig.split(":")[0] == algo_sig.split(":")[0]

def integrity_check(data_sig: str, algo_sig: str, phi: float, phi_max: float = 1.5) -> IntegrityReport:
    iso = isomorphic_handshake(data_sig, algo_sig)
    bias_ok = (phi <= phi_max)
    msg = []
    if not iso: msg.append("isomorphic handshake failed")
    if not bias_ok: msg.append(f"bias φ={phi:.2f} exceeds bound {phi_max:.2f}")
    return IntegrityReport(iso, bias_ok, "; ".join(msg))
```

---

## 10.4 Medical Triage Example (Skin‑Lesion Demo)

```python
# obiai/medical.py
from typing import Dict, List
from dataclasses import dataclass
from .ontology import Identity, OntologicalAgent
from .inference import (
    Hypothesis, bayes_update, likelihood_model, coordinate_bias_adjustment,
    compute_ocm, update_mode, bias_amplification
)
from .infrastructure import integrity_check

@dataclass
class DecisionOut:
    mode: str
    ocm: float
    identity: Identity
    posterior: List[Hypothesis]
    audit: Dict

class MedicalDiagnosisAgent(OntologicalAgent):
    def __init__(self, identity: Identity):
        super().__init__(identity)
        self.mode = "PATTERN"

    def diagnose(self, observation: Dict, demographic: Dict) -> DecisionOut:
        # 1) Ontology: set coordinates based on demographic risk & coverage
        if demographic.get("skin_tone") in {"IV", "V", "VI"}:
            xyz = {"x": 0.7, "y": 0.6, "z": 0.9}
        else:
            xyz = {"x": 0.8, "y": 0.9, "z": 0.6}

        # 2) Infrastructure: gate on integrity & bias
        phi = demographic.get("bias_phi", 1.1)
        report = integrity_check(data_sig="derm:v3:hash123", algo_sig="derm:v3:hashABC", phi=phi)
        if not (report.coordinate_ok and report.bias_bounds_ok):
            # Fail closed: remain in Pattern Mode and return with audit
            return DecisionOut(
                mode="PATTERN", ocm=0.0, identity=self.identity, posterior=[],
                audit={"integrity": report.message or "ok", "xyz": xyz}
            )

        # 3) Inference: prior → likelihood → posterior → coordinate adjustment
        prior = [Hypothesis("malignant", 0.5), Hypothesis("benign", 0.5)]
        L = likelihood_model(observation, prior, xyz)
        post = bayes_update(prior, L)
        post = coordinate_bias_adjustment(post, xyz)

        # 4) Metrics → OCM → Mode
        # Placeholder metrics; wire to real calibration/coherence estimators in production
        ocm = compute_ocm(ece=0.02, coherence=0.95, semantic=0.94)
        self.mode = update_mode(ocm, self.mode)

        # 5) Audit
        audit = {
            "ece": 0.02, "coherence": 0.95, "semantic": 0.94,
            "phi": phi, "baf": bias_amplification(phi, layers=12),
            "xyz": xyz, "integrity": "ok"
        }
        return DecisionOut(self.mode, ocm, self.identity, post, audit)
```
