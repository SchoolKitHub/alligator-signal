// content.js – Floating UI panel for Alligator Signal Assistant

(function() {
  console.log("[PO-Signal-Assistant] content.js loading...");
  if (window.__agPanelInjected) {
    console.log("[PO-Signal-Assistant] Already injected, skipping.");
    return;
  }
  window.__agPanelInjected = true;

  // CSS setup
  try {
    console.log("[PO-Signal-Assistant] Injecting panel.css stylesheet link dynamically");
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('panel.css');
    document.head.appendChild(cssLink);
  } catch (err) {
    console.warn("[PO-Signal-Assistant] Dynamic CSS injection failed, relying on native manifest injection:", err);
  }

  // State
  let activeAsset = "EUR/USD OTC";
  let currentPrice = "—";
  let settings = {
    stake: 1500,
    convergenceThreshold: 0.02,
    cooldownLimit: 3,
    cooldownDuration: 5, // minutes
    soundEnabled: true
  };
  let consecutiveLosses = 0;
  let cooldownEndTime = 0;
  let cooldownTimerInterval = null;
  let serverTimeOffset = null;

  // Load Settings and Journal Stats on Startup
  try {
    console.log("[PO-Signal-Assistant] Retrieving storage settings...");
    chrome.storage.local.get(['settings', 'consecutiveLosses', 'cooldownEndTime', 'panelPosition', 'ratingPromptDismissed'], (result) => {
      console.log("[PO-Signal-Assistant] Storage retrieval callback fired. Result:", result);
      if (chrome.runtime.lastError) {
        console.error("[PO-Signal-Assistant] Storage runtime error:", chrome.runtime.lastError);
      }
      if (result.settings) {
        settings = { ...settings, ...result.settings };
      }
      if (typeof result.consecutiveLosses === 'number') {
        consecutiveLosses = result.consecutiveLosses;
      }
      if (typeof result.cooldownEndTime === 'number') {
        cooldownEndTime = result.cooldownEndTime;
      }
      if (result.ratingPromptDismissed) {
        window.__ratingPromptDismissed = true;
      }

      initUI(result.panelPosition);
      checkCooldown();
      updateStatsDisplay();
    });
  } catch (err) {
    console.error("[PO-Signal-Assistant] Critical storage exception:", err);
  }

  // Listen for storage changes (sync settings in real-time)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
    }
  });

  // Inject UI
  let panel = null;
  function initUI(panelPosition) {
    console.log("[PO-Signal-Assistant] Constructing floating UI panel element");
    panel = document.createElement('div');
    panel.id = 'agAssistant';
    
    // Restore saved panel position if available
    if (panelPosition && panelPosition.right && panelPosition.top) {
      panel.style.right = panelPosition.right;
      panel.style.top = panelPosition.top;
      panel.style.position = 'fixed';
    }

    panel.innerHTML = `
      <div class="ag-header">
        <span class="ag-title">ALLIGATOR SIGNAL</span>
        <span class="ag-asset">${activeAsset}</span>
      </div>

      <div class="ag-price-row">
        <span class="ag-price-label">Price</span>
        <span class="ag-price-val" id="agPrice">${currentPrice}</span>
      </div>

      <div class="ag-signal-container">
        <div class="ag-signal-lbl">Signal Decision</div>
        <div class="ag-signal-val sig-notrade" id="agSignal">NO TRADE</div>
        <div class="ag-conf-bar-bg">
          <div class="ag-conf-bar-fg" id="agConfBar"></div>
        </div>
        <div class="ag-score-row" id="agScoreRow">
          <span>CONFIDENCE</span>
          <span class="ag-score-val-text" id="agScoreValText">0.0<span class="ag-score-max">/10</span></span>
        </div>
      </div>

      <div class="ag-details-box" id="agDetails">
        <div class="ag-detail-item" style="color: #64748b; font-style: italic;">Waiting for WebSocket price feed ticks...</div>
      </div>

      <div class="ag-foot" id="agFoot">
        <span class="ag-foot-l">EXPIRES</span>
        <span class="ag-foot-c" id="agExpiryText">00:00:05</span>
        <span class="ag-foot-r" id="agLatencyText">WS &middot; —ms</span>
      </div>

      <div class="ag-journal-row">
        <button class="ag-btn ag-btn-win" id="agWinBtn">WIN</button>
        <button class="ag-btn ag-btn-loss" id="agLossBtn">LOSS</button>
        <button class="ag-btn ag-btn-draw" id="agDrawBtn">DRAW</button>
      </div>

      <div class="ag-stats-row">
        <div class="ag-stat-item">Win Rate: <span id="agStatWinRate">0%</span></div>
        <div class="ag-stat-item">Net: <span id="agStatNetProfit">$0</span></div>
      </div>
    `;

    console.log("[PO-Signal-Assistant] Appending floating panel to document.body");
    document.body.appendChild(panel);
    console.log("[PO-Signal-Assistant] Floating panel successfully added to DOM");

    // Inject the visual neon flash overlay
    let flashOverlay = document.getElementById('agFlashOverlay');
    if (!flashOverlay) {
      flashOverlay = document.createElement('div');
      flashOverlay.id = 'agFlashOverlay';
      document.body.appendChild(flashOverlay);
    }

    // Button event listeners
    document.getElementById('agWinBtn').addEventListener('click', () => logManualTrade('win'));
    document.getElementById('agLossBtn').addEventListener('click', () => logManualTrade('loss'));
    document.getElementById('agDrawBtn').addEventListener('click', () => logManualTrade('draw'));

    // Drag and drop setup for position customization
    const header = panel.querySelector('.ag-header');
    if (header) {
      let isDragging = false;
      let startX, startY;
      let startRight, startTop;

      header.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        isDragging = true;
        header.style.cursor = 'grabbing';
        
        startX = e.clientX;
        startY = e.clientY;
        
        const computedStyle = window.getComputedStyle(panel);
        startRight = parseInt(computedStyle.right, 10) || 20;
        startTop = parseInt(computedStyle.top, 10) || (window.innerHeight * 0.15);
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      });

      function onMouseMove(e) {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newRight = startRight - deltaX;
        const newTop = startTop + deltaY;
        
        // Boundaries clamp (offset values to retain visible control panel bounds)
        const clampedRight = Math.max(10, Math.min(window.innerWidth - 340, newRight));
        const clampedTop = Math.max(10, Math.min(window.innerHeight - 320, newTop));
        
        panel.style.right = `${clampedRight}px`;
        panel.style.top = `${clampedTop}px`;
      }

      function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        header.style.cursor = 'grab';
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Save state to store panel position persistently
        chrome.storage.local.set({
          panelPosition: {
            right: panel.style.right,
            top: panel.style.top
          }
        });
      }
    }

    // Keyboard shortcuts keydown listener
    window.addEventListener('keydown', (e) => {
      // Guard: Ignore input when typing inside forms or text fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (e.altKey) {
        if (key === 'w') {
          e.preventDefault();
          logManualTrade('win');
          flashButtonFeedback('agWinBtn');
        } else if (key === 'l') {
          e.preventDefault();
          logManualTrade('loss');
          flashButtonFeedback('agLossBtn');
        } else if (key === 'd') {
          e.preventDefault();
          logManualTrade('draw');
          flashButtonFeedback('agDrawBtn');
        }
      }
    });

    // Momentary visual feedback pulse for journal button hotkeys
    function flashButtonFeedback(btnId) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.style.transform = 'scale(0.95)';
        btn.style.filter = 'brightness(1.3)';
        setTimeout(() => {
          btn.style.transform = '';
          btn.style.filter = '';
        }, 150);
      }
    }

    // Real-time expiry countdown timer
    setInterval(() => {
      if (serverTimeOffset === null) return;

      const serverTimeMs = Date.now() + serverTimeOffset;
      const timeframe = 5; // 5-second candles
      const remainingSec = Math.max(0, timeframe - ((serverTimeMs / 1000) % timeframe));
      
      const displaySec = Math.ceil(remainingSec);
      
      // format as 00:00:SS
      const expiryText = `00:00:${displaySec.toString().padStart(2, '0')}`;
      
      const expiryEl = document.getElementById('agExpiryText');
      if (expiryEl) {
        expiryEl.textContent = expiryText;
        
        // Red color warning when expiring (under 2 seconds remaining)
        if (remainingSec <= 2.0) {
          expiryEl.style.color = '#e74c3c';
        } else {
          expiryEl.style.color = '#00f2fe';
        }
      }
    }, 100);
  }

  // Handle price ticks
  window.addEventListener('agPriceTick', (e) => {
    currentPrice = e.detail.price;
    const priceEl = document.getElementById('agPrice');
    if (priceEl) priceEl.textContent = currentPrice;

    // Calculate time offset: server_time_ms - local_time_ms
    if (e.detail.timestamp) {
      serverTimeOffset = e.detail.timestamp * 1000 - Date.now();
    }

    // Update real-time latency
    if (e.detail.rxTime) {
      const internalDelay = performance.now() - e.detail.rxTime;
      const totalLatency = Math.round(internalDelay + 9);
      const latencyEl = document.getElementById('agLatencyText');
      if (latencyEl) latencyEl.innerHTML = `WS &middot; ${totalLatency}ms`;
    }
  });

  // Handle strategy updates
  window.addEventListener('agStrategyUpdate', (e) => {
    if (Date.now() < cooldownEndTime) return; // ignore signals during cooldown

    const analysis = e.detail;
    updateSignalUI(analysis);

    // Update real-time latency
    if (analysis.rxTime) {
      const internalDelay = performance.now() - analysis.rxTime;
      const totalLatency = Math.round(internalDelay + 9);
      const latencyEl = document.getElementById('agLatencyText');
      if (latencyEl) latencyEl.innerHTML = `WS &middot; ${totalLatency}ms`;
    }

    // Audio alarm if enabled
    if (settings.soundEnabled && window.agAudio) {
      if (analysis.signal === 'BUY') {
        window.agAudio.playBuy();
      } else if (analysis.signal === 'SELL') {
        window.agAudio.playSell();
      }
    }
  });

  // Update Signal and Confidence UI
  function updateSignalUI(analysis) {
    const signalEl = document.getElementById('agSignal');
    const confBarEl = document.getElementById('agConfBar');
    const detailsEl = document.getElementById('agDetails');

    if (!signalEl || !confBarEl || !detailsEl) return;

    signalEl.textContent = analysis.signal;
    signalEl.className = 'ag-signal-val';

    if (analysis.signal === 'BUY') {
      signalEl.classList.add('sig-buy');
    } else if (analysis.signal === 'SELL') {
      signalEl.classList.add('sig-sell');
    } else {
      signalEl.classList.add('sig-notrade');
    }

    // Confidence bar width
    const percentage = analysis.confidence * 10;
    confBarEl.style.width = `${percentage}%`;

    // Confidence text score
    const scoreValTextEl = document.getElementById('agScoreValText');
    if (scoreValTextEl) {
      scoreValTextEl.innerHTML = `${analysis.confidence.toFixed(1)}<span class="ag-score-max">/10</span>`;
    }

    // Visual neon edge flash overlay trigger
    const flashOverlay = document.getElementById('agFlashOverlay');
    if (flashOverlay) {
      flashOverlay.className = ''; // Reset state
      if (analysis.signal === 'BUY') {
        void flashOverlay.offsetWidth; // Force reflow
        flashOverlay.classList.add('flash-buy');
      } else if (analysis.signal === 'SELL') {
        void flashOverlay.offsetWidth; // Force reflow
        flashOverlay.classList.add('flash-sell');
      }
    }

    // Reasons list
    if (analysis.reason) {
      const items = analysis.reason.split('; ');
      const isBuy = analysis.signal === 'BUY';
      const isSell = analysis.signal === 'SELL';
      
      let iconHtml = '';
      if (isBuy) {
        iconHtml = '<span class="ag-detail-icon sig-buy">▲</span>';
      } else if (isSell) {
        iconHtml = '<span class="ag-detail-icon sig-sell">▼</span>';
      } else {
        iconHtml = '<span class="ag-detail-icon sig-notrade">◆</span>';
      }

      detailsEl.innerHTML = items.map(item => `
        <div class="ag-detail-item">
          ${iconHtml}
          <span>${item}</span>
        </div>
      `).join('');
    } else {
      detailsEl.innerHTML = `<div class="ag-detail-item" style="color: #64748b; font-style: italic;">No active trading patterns detected.</div>`;
    }
  }

  // Update Stats Footer
  async function updateStatsDisplay() {
    if (!window.agJournalInstance) return;
    const data = await window.agJournalInstance.getData();

    const winRateEl = document.getElementById('agStatWinRate');
    const netProfitEl = document.getElementById('agStatNetProfit');

    if (winRateEl) winRateEl.textContent = `${data.winRate}%`;
    if (netProfitEl) {
      const isNegative = data.netProfit < 0;
      netProfitEl.textContent = `${isNegative ? '-' : ''}$${Math.abs(Math.round(data.netProfit)).toLocaleString()}`;
      netProfitEl.style.color = data.netProfit >= 0 ? '#2ecc71' : '#e74c3c';
    }

    // Trustpilot client-side Reputation Trigger prompt
    if (data.total >= 10 && data.winRate >= 50 && !window.__ratingPromptDismissed && !document.getElementById('agRatingCard')) {
      showRatingCard();
    }
  }

  // Show Trustpilot rating card prompt
  function showRatingCard() {
    if (document.getElementById('agRatingCard') || !panel) return;
    const ratingCard = document.createElement('div');
    ratingCard.id = 'agRatingCard';
    ratingCard.className = 'ag-rating-card';
    ratingCard.innerHTML = `
      <div class="ag-rating-header">
        <span>Help Us Grow</span>
        <button class="ag-rating-close" id="agRatingCloseBtn">&times;</button>
      </div>
      <div class="ag-rating-body">
        <p>Your manual discipline pays off. Rate Alligator Signal on Trustpilot to keep it free and local-first!</p>
        <a href="https://www.trustpilot.com/evaluate/alligatorsignal.io" target="_blank" class="ag-rating-btn" id="agRatingBtn">Review on Trustpilot</a>
      </div>
    `;
    
    panel.appendChild(ratingCard);

    document.getElementById('agRatingCloseBtn').addEventListener('click', () => {
      ratingCard.remove();
      window.__ratingPromptDismissed = true;
      chrome.storage.local.set({ ratingPromptDismissed: true });
    });

    document.getElementById('agRatingBtn').addEventListener('click', () => {
      ratingCard.remove();
      window.__ratingPromptDismissed = true;
      chrome.storage.local.set({ ratingPromptDismissed: true });
    });
  }

  // Log trade from dashboard buttons
  async function logManualTrade(outcome) {
    if (!window.agJournalInstance) return;

    await window.agJournalInstance.logTrade(activeAsset, outcome, settings.stake);
    updateStatsDisplay();

    // Check Cooldown trigger on Loss
    if (outcome === 'loss') {
      consecutiveLosses++;
      if (consecutiveLosses >= settings.cooldownLimit) {
        startCooldown();
      } else {
        chrome.storage.local.set({ consecutiveLosses });
      }
    } else if (outcome === 'win') {
      consecutiveLosses = 0;
      chrome.storage.local.set({ consecutiveLosses });
    }
  }

  // Start Cooldown Screen
  function startCooldown() {
    cooldownEndTime = Date.now() + settings.cooldownDuration * 60 * 1000;
    chrome.storage.local.set({ cooldownEndTime, consecutiveLosses: 0 });
    consecutiveLosses = 0;
    checkCooldown();
  }

  // Handle active cooldown timers
  function checkCooldown() {
    if (cooldownTimerInterval) {
      clearInterval(cooldownTimerInterval);
      cooldownTimerInterval = null;
    }

    if (Date.now() < cooldownEndTime) {
      // Create cooldown overlay
      let overlay = document.querySelector('.ag-cooldown-overlay');
      if (!overlay && panel) {
        overlay = document.createElement('div');
        overlay.className = 'ag-cooldown-overlay';
        panel.appendChild(overlay);
      }

      const updateTimer = () => {
        const remaining = Math.max(0, cooldownEndTime - Date.now());
        if (remaining <= 0) {
          clearInterval(cooldownTimerInterval);
          if (overlay) overlay.remove();
          cooldownEndTime = 0;
          chrome.storage.local.set({ cooldownEndTime: 0 });
          // Reset UI
          const signalEl = document.getElementById('agSignal');
          if (signalEl) {
            signalEl.textContent = "NO TRADE";
            signalEl.className = "ag-signal-val sig-notrade";
          }
          const confBarEl = document.getElementById('agConfBar');
          if (confBarEl) confBarEl.style.width = '0%';
          const scoreValTextEl = document.getElementById('agScoreValText');
          if (scoreValTextEl) scoreValTextEl.innerHTML = `0.0<span class="ag-score-max">/10</span>`;
          const detailsEl = document.getElementById('agDetails');
          if (detailsEl) detailsEl.innerHTML = `<div class="ag-detail-item">Cooldown ended. Monitoring market...</div>`;
          return;
        }

        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const pad = (n) => n.toString().padStart(2, '0');

        overlay.innerHTML = `
          <div class="ag-cooldown-title">Discipline Lock</div>
          <div class="ag-cooldown-desc">Loss limit reached. Take a break to avoid revenge trading.</div>
          <div class="ag-cooldown-timer">${pad(mins)}:${pad(secs)}</div>
        `;
      };

      updateTimer();
      cooldownTimerInterval = setInterval(updateTimer, 1000);
    }
  }

  function updateActiveAsset(asset) {
    if (!asset || typeof asset !== 'string') return;
    
    // Convert format like "EURUSD_otc" to "EUR/USD OTC"
    let formatted = asset.replace(/_otc/i, ' OTC');
    if (formatted.length === 10 && formatted.includes(' ')) {
      const main = formatted.substring(0, 6);
      formatted = main.substring(0, 3) + '/' + main.substring(3) + ' OTC';
    } else if (formatted.length === 6 && !formatted.includes('/')) {
      formatted = formatted.substring(0, 3) + '/' + formatted.substring(3);
    }
    activeAsset = formatted.toUpperCase();

    const assetEl = document.querySelector('.ag-asset');
    if (assetEl) assetEl.textContent = activeAsset;
    console.log("[PO-Signal-Assistant] content.js: Active asset updated to:", activeAsset);
  }

  // Intercept Symbol Updates (Outgoing and Incoming)
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    const { source, event, data } = e.data;
    
    if (source === 'PO_WS_OUTGOING') {
      if (event === 'changeSymbol' || event === 'subscribeSymbol') {
        let asset = "";
        if (typeof data === 'string') {
          asset = data;
        } else if (data && typeof data === 'object') {
          asset = data.asset || data.symbol;
        }
        if (asset) updateActiveAsset(asset);
      }
    } else if (source === 'PO_WS_INCOMING') {
      if (event === 'updateHistoryNewFast') {
        if (data && data.asset) {
          updateActiveAsset(data.asset);
        }
      }
    }
  });

  // Direct user gesture audio unlock to bypass Chrome Autoplay policy
  const unlockAudio = () => {
    if (window.agAudio && typeof window.agAudio.unlock === 'function') {
      window.agAudio.unlock();
      // Remove listeners once unlock attempt is made
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    }
  };
  document.addEventListener('click', unlockAudio);
  document.addEventListener('keydown', unlockAudio);

})();
