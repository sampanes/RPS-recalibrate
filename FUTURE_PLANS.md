## FUTURE_PLANS.md: Technical Implementation of Motor-Sensory Recalibration

This document serves as an exhaustive technical roadmap for implementing a "Mind-Reading" Rock Paper Scissors game. The core logic is based on the findings of Stetson et al. (2006) [cite_start]regarding the brain's dynamic temporal recalibration[cite: 2, 22].

---

### 1. The Calibration Engine (Normal Mode)
[cite_start]The primary objective of the Normal Mode is to shift the participant's **Point of Subjective Simultaneity (PSS)**—the time difference at which the user perceives their action and the game's response to be simultaneous[cite: 81, 103].

#### Technical Specifications:
* [cite_start]**Injected Delay Constant ($\Delta T_{adapted}$):** Implement a fixed delay of **135 ms** between the user's input (motor action) and the game's result (sensory feedback)[cite: 23, 76]. 
* **Adaptation Threshold:** The system must enforce a minimum of **20 consecutive trials** at this fixed delay. Research indicates that recalibration reaches its full magnitude within this timeframe[cite: 310].
* [cite_start]**Temporal Order Judgment (TOJ) Training:** * During the first 20 rounds, the "result event" (Beep + Bot Move) must occur exactly at $T_{input} + 135$ ms[cite: 61, 70].
    * This "trains" the brain to expect a delay, shifting the psychometric function in a positive direction[cite: 83].
* [cite_start]**Randomization Logic:** To prevent the user from detecting the fixed nature of the lag, 40% of trials should feature a variable delay (a Gaussian distribution centered at 60 ms after the keypress) to mimic "organic" latency[cite: 348, 349].

---

### 2. The Gaslight Engine (Illusion Mode)
[cite_start]Once the PSS has shifted by the expected average of **44 ms**, the game transitions to "Gaslight Mode" to induce an **illusory reversal of temporal order**[cite: 24, 83, 85].

#### Technical Specifications:
* **The "Impossible" Window ($\Delta T_{illusion}$):** When the "mind-read" is triggered, the system reduces the delay from 135 ms to the system minimum, ideally **35 ms**[cite: 60, 80].
* **Asymmetric Display Logic:**
    * **Bot Move & Beep:** Triggered at $T_{input} + 35$ ms. [cite_start]Because the brain is adapted to 135 ms, it perceives this 35 ms event as occurring *before* the action was completed[cite: 24, 173].
    * **User Move Display:** Retain the 135 ms delay for the user's own choice. This creates a 100 ms "temporal gap" where the bot's move is visible before the user's own move appears, reinforcing the "mind-reading" narrative.
* **Causality Exploitation:** The bot must register the user choice at $T_{input} + 5$ ms. It then has a 30 ms buffer to select the winning move before the "Impossible Window" display at 35 ms.

---

### 3. Neural Conflict Optimization
[cite_start]The gaslight is most effective when it triggers maximum activity in the **Anterior Cingulate Cortex (ACC)** and **Medial Frontal Cortex (MFC)**[cite: 25, 193].

#### Optimization Parameters:
* **Sensory Modality:** Use a high-frequency "Beep" as the sensory trigger. While the paper used flashes, auditory-motor loops are highly sensitive to timing recalibration[cite: 331, 375].
* [cite_start]**Consistency:** The "illusion" trials must be identical to "baseline" trials in every way except for the timing shift to ensure the ACC activation is not due to task difficulty or "oddball" effects[cite: 194, 263].
* **Magnitude Constraints:** * Maintain the calibration delay around 100–135 ms. 
    * [cite_start]Data shows that the effect diminishes at larger delays (250 ms, 500 ms, and 1000 ms) as the brain ceases to interpret the feedback as a consequence of the action[cite: 174, 177].

---

### 4. Implementation Checklist
* [cite_start][ ] **High-Precision Timers:** Utilize system-level micro-timers to ensure the 135 ms and 35 ms benchmarks are frame-accurate[cite: 80].
* [ ] **Input Buffer:** Capture the user's move at the earliest possible interrupt to allow the bot maximum "thinking time" during the 35 ms window.
* [cite_start][ ] **Adaptive Trial Counter:** Track the running average of the user's PSS shift to determine when they are "fully adapted" for the gaslight[cite: 310].
* [cite_start][ ] **ACC Trigger Logic:** Deploy the illusion specifically on rounds where the user's "confidence" (based on previous reaction times) is highest[cite: 270, 318].

---

**Source:** Stetson, C., Cui, X., Montague, P. R., & Eagleman, D. M. (2006). Motor-Sensory Recalibration Leads to an Illusory Reversal of Action and Sensation. [cite_start]*Neuron*, 51, 651-659[cite: 1, 2, 3].