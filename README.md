# Pocket Option 5-Second Alligator Signal Assistant

A lightweight Chrome Extension designed as a **manual trading assistant** for the Pocket Option platform. It calculates high-frequency Alligator moving average crossovers on 5-second charts, calculates signal confidence scores, triggers audio/visual alarms, and provides a discipline trade journal—**keeping final trade execution entirely manual**.

---

## ⚠️ Important Disclaimer & Guidelines
* **No Automated Execution**: This assistant **never** auto-clicks buy or sell buttons. It has no capabilities to execute trades programmatically. You must manually decide and click your positions.
* **Demo Mode Recommendation**: Automated signal analysis is subject to market risks. It is highly recommended to run this assistant on a **Demo Account** to test your discipline and backtest your strategy parameters.

---

## Core Features
1. **Real-time WebSocket Interception**: Intercepts prices directly from the platform's feed to ensure sub-millisecond calculation speeds without making server-side API requests.
2. **5-Second Alligator Calculations**:
   * **Jaws (Blue)**: Period 12, Shift 7
   * **Teeth (Grey)**: Period 7, Shift 4
   * **Lips (Green)**: Period 4, Shift 2
3. **On-Screen Assistant Panel**: Displays asset info, current price, active signal (**BUY**, **SELL**, or **NO TRADE**), and a detailed breakdown of signal reasons.
4. **Signal Confidence (1-10)**: Dynamic scoring system mapping crossover speed, line separation, and candle confirmations.
5. **Web Audio Alarm synthesizer**: Synthesizes custom rising double-beeps (for BUY) and descending triangle-wave beeps (for SELL) directly through code, bypassing the need for heavy audio file dependencies.
6. **Loss Cooldown & Discipline Lock**: Automatically blocks signals and overlays a countdown screen when you hit your consecutive loss limit, preventing emotional "revenge trading."
7. **Manual Trade Journal**: One-click logging (Win, Loss, Draw) directly on the floating dashboard. Win rate and net profit statistics are updated and stored inside local extension storage.

---

## Installation Guide

Follow these steps to load the extension into your Chromium-based browser (Chrome, Brave, Edge, Opera, etc.):

1. **Download/Save Files**: Ensure the following files are saved in the `extension/` directory:
   * `manifest.json`
   * `inject.js`
   * `strategy.js`
   * `journal.js`
   * `content.js`
   * `popup.html`
   * `popup.js`
   * `popup.css`
   * `README.md`
2. **Open Extensions Page**: Open your browser and navigate to `chrome://extensions/` (or `brave://extensions/`).
3. **Enable Developer Mode**: Toggle the **Developer Mode** switch in the top right corner.
4. **Load Unpacked**: Click the **Load unpacked** button in the top left.
5. **Select Folder**: Select the `extension/` folder containing the project files.
6. **Open Pocket Option**: Open `pocketoption.com/en/cabinet/` in your browser. The assistant panel will automatically attach to the right side of the chart!

---

## Technical Specifications & Signal Logic

### Indicator Calculations
* All lines are calculated using the **Smoothed Moving Average (SMMA)** formula:
  $$\text{SMMA}_i = \frac{\text{SMMA}_{i-1} \times (\text{Period} - 1) + \text{Close}_i}{\text{Period}}$$
* The lines are shifted forward in time according to their shift parameters (Jaws: 7, Teeth: 4, Lips: 2).

### Crossover Detection
* **BUY Signal Criteria**:
  * Lips (Green) crosses above Teeth (Grey).
  * Lips (Green) crosses above Jaws (Blue).
  * Teeth (Grey) confirms upward direction (sloping up).
  * The last completed 5-second candle closes bullish.
  * Lips and Teeth lines begin separating upward.
* **SELL Signal Criteria**:
  * Lips (Green) crosses below Teeth (Grey).
  * Lips (Green) crosses below Jaws (Blue).
  * Teeth (Grey) confirms downward direction (sloping down).
  * The last completed 5-second candle closes bearish.
  * Lips and Teeth lines begin separating downward.
* **NO TRADE Criteria**:
  * Lines are tangled (flat market / consolidation).
  * Signal confidence is below 7.
  * Active Cooldown mode is running.

### Confidence Score Breakdown (Max 10 Points)
* **Lips crosses clearly**: 2 points
* **Teeth confirms direction**: 2 points
* **Jaws is broken (Lips & Price above/below it)**: 2 points
* **Mouth is opening (Separation increases)**: 2 points
* **Closed candle confirms direction**: 1 point
* **No rejection wick (Wick size is small)**: 1 point

*Signal Decision thresholds:*
* **9 - 10**: Strong BUY/SELL
* **7 - 8**: Standard BUY/SELL
* **0 - 6**: NO TRADE (Watch/Wait)
