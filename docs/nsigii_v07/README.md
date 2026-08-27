# NSIGII v0.7.0 - Windows Installation & Usage Guide

## Quick Start for Windows Users

### Prerequisites
- Python 3.7 or higher
- pip (Python package installer)

### Installation

1. **Install Required Packages**
   Open PowerShell or Command Prompt and run:
   ```powershell
   pip install numpy matplotlib
   ```

2. **Download NSIGII Files**
   Ensure you have these files in your directory:
   - `nsigii_simulation_crossplatform.py` - Main simulation
   - `nsigii_determinant_decoder_crossplatform.py` - Analysis & decoder

### Usage

#### Step 1: Run the Simulation

```powershell
python nsigii_simulation_crossplatform.py
```

This will:
- Run a 10-step NSIGII simulation
- Generate `nsigii_simulation_results.json` in the current directory
- Display real-time output of system states

**Expected Output:**
```
================================================================================
NSIGII v0.7.0 SIMULATION - 10 steps
================================================================================

--- STEP 1 ---
State: OPEN
Suffering: Σ=4.50 (Zone: CATASTROPHIC)
Determinant: 0.2164
...
```

#### Step 2: Analyze Results

```powershell
python nsigii_determinant_decoder_crossplatform.py
```

This will:
- Read `nsigii_simulation_results.json`
- Decode all determinant matrices
- Generate `nsigii_full_analysis.json` with complete analysis
- Create `nsigii_encoding_space.png` visualization
- Display detailed analysis for each step

**Expected Output:**
```
================================================================================
NSIGII v0.7.0 DETERMINANT DECODER - Cross-Platform Version
================================================================================

Found input file: C:\Users\OBINexus\Downloads\NSIGII_V7\nsigii_simulation_results.json

Analyzing encoded states...
================================================================================
ANALYSIS OF STEP 1
================================================================================
NSIGII SYSTEM STATE SUMMARY
===========================

Determinant: 0.2164 (positive)
State: STABLE_ORDERED
...
```

### Output Files

After running both scripts, you'll have:

1. **nsigii_simulation_results.json** - Raw simulation data
2. **nsigii_full_analysis.json** - Decoded analysis with interpretations
3. **nsigii_encoding_space.png** - 6-panel visualization showing:
   - BiOrder vs BiChaos space
   - Determinant evolution over time
   - BiAmbiguity load
   - 3D encoding space
   - Order/Chaos balance ratio
   - System polarity tracking

### Customizing the Simulation

Edit `nsigii_simulation_crossplatform.py` to change parameters:

```python
# At the bottom of the file, modify these values:
results = nsigii.run_simulation(
    steps=10,        # Number of simulation steps
    needs=10,        # N parameter (energy, attention, time)
    resources=7,     # R parameter (internal + external resources)
    constraint=1.5   # K parameter (agency loss, entropy)
)
```

**Suffering Calculation:** Σ = (N - R) × K

Example configurations:

1. **Resilient System** (no suffering):
   ```python
   needs=10, resources=10, constraint=0  # Σ = 0
   ```

2. **Moderate Suffering**:
   ```python
   needs=10, resources=8, constraint=1.0  # Σ = 2.0
   ```

3. **High Suffering** (default):
   ```python
   needs=10, resources=7, constraint=1.5  # Σ = 4.5
   ```

### Understanding the Output

#### BiOrder/BiChaos/BiAmbiguity

- **BiOrder (0.0-1.0)**: Structured, predictable components
  - High values = System is organized and stable
  - Tennis scoring ratio: 8/13 ≈ 0.62

- **BiChaos (0.0-1.0)**: Entropic, unpredictable components
  - High values = System is chaotic and unstable
  - Tennis scoring ratio: 5/13 ≈ 0.38

- **BiAmbiguity (0-3)**: Unresolved semantic channels
  - 0 = Clear (single interpretation)
  - 1 = Low ambiguity (2 interpretations)
  - 2 = High ambiguity (4 interpretations)
  - 3 = Maximal ambiguity (8 interpretations)

#### Determinant Values

- **det > 0**: Orientation preserved (stable if BiOrder > BiChaos)
- **det < 0**: Orientation reversed (polarity inversion)
- **det ≈ 0**: System at critical collapse point (singular)
- **|det|**: Volume scaling factor (transformation magnitude)

#### System States

1. **STABLE_ORDERED**: det > 0, BiOrder > BiChaos
   - Healthy system with structure dominance
   
2. **UNSTABLE_CHAOTIC**: det > 0, BiChaos > BiOrder
   - Chaotic but orientation preserved
   
3. **INVERTED_ORDERED**: det < 0, BiOrder > BiChaos
   - Polarity reversal with order dominance
   
4. **INVERTED_CHAOTIC**: det < 0, BiChaos > BiOrder
   - Polarity reversal with chaos dominance
   
5. **CRITICAL**: det ≈ 0
   - System at collapse point

### Troubleshooting

**Problem:** `FileNotFoundError: nsigii_simulation_results.json`

**Solution:** Run the simulation script first:
```powershell
python nsigii_simulation_crossplatform.py
```

---

**Problem:** `ModuleNotFoundError: No module named 'numpy'`

**Solution:** Install required packages:
```powershell
pip install numpy matplotlib
```

---

**Problem:** Visualization not generating

**Solution:** Check if matplotlib backend is configured:
```python
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
```

---

**Problem:** Permission denied when saving files

**Solution:** Run PowerShell as Administrator or save to a different directory:
```python
output_dir = Path.home() / 'Documents' / 'NSIGII'
output_dir.mkdir(exist_ok=True)
```

### Advanced Usage

#### Running Multiple Simulations

Create a batch script `run_multiple.py`:

```python
import nsigii_simulation_crossplatform as sim
from pathlib import Path

# Test different parameter combinations
configs = [
    {"needs": 10, "resources": 10, "constraint": 0},   # Resilient
    {"needs": 10, "resources": 8, "constraint": 1.0},  # Moderate
    {"needs": 10, "resources": 5, "constraint": 2.0},  # Severe
]

for i, config in enumerate(configs):
    print(f"\n{'='*80}")
    print(f"Running configuration {i+1}: {config}")
    print(f"{'='*80}")
    
    nsigii = sim.NSIGIIv0_7()
    results = nsigii.run_simulation(steps=20, **config)
    
    # Save with unique filename
    output_file = Path.cwd() / f'nsigii_results_config_{i+1}.json'
    # ... save results
```

#### Exporting to Excel

```python
import pandas as pd
import json

with open('nsigii_full_analysis.json', 'r') as f:
    data = json.load(f)

# Extract key metrics
records = []
for analysis in data['analyses']:
    records.append({
        'Determinant': analysis['determinant_analysis']['determinant'],
        'BiOrder': analysis['biorder_bichaos_extraction']['biorder_score'],
        'BiChaos': analysis['biorder_bichaos_extraction']['bichaos_score'],
        'Ambiguity': analysis['ambiguity_analysis']['unresolved_channels'],
        'State': analysis['state_reconstruction']['state_classification']
    })

df = pd.DataFrame(records)
df.to_excel('nsigii_analysis.xlsx', index=False)
```

### Getting Help

For questions or issues:
1. Check this README
2. Review the comprehensive documentation: `NSIGII_v0_7_DOCUMENTATION.md`
3. Examine the code comments in the Python files
4. Contact: Nnamdi Michael Okpala (OBINexus)

### System Requirements

- **OS**: Windows 10/11 (also works on Linux/macOS)
- **Python**: 3.7+
- **RAM**: 512MB minimum (1GB recommended)
- **Disk**: 50MB for code and outputs
- **Display**: Any resolution (for viewing PNG visualization)

### File Structure

```
NSIGII_V7/
├── nsigii_simulation_crossplatform.py       # Main simulation
├── nsigii_determinant_decoder_crossplatform.py  # Decoder & analyzer
├── README_WINDOWS.md                        # This file
├── NSIGII_v0_7_DOCUMENTATION.md            # Full documentation
├── nsigii_simulation_results.json          # Generated data
├── nsigii_full_analysis.json               # Generated analysis
└── nsigii_encoding_space.png               # Generated visualization
```

### Version History

- **v0.7.0** (2026-02-07): Initial release with cross-platform support
  - Bipolar state machine
  - Determinant-based encoding
  - BiOrder/BiChaos/BiAmbiguity framework
  - Windows compatibility
  - Comprehensive visualization

---

**NSIGII v0.7.0**  
Author: Nnamdi Michael Okpala (OBINexus)  
Date: February 7, 2026
