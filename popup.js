// popup.js logic for settings and stats

document.addEventListener('DOMContentLoaded', async () => {
  const journal = new TradeJournal();

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.getElementById(tabId);
      if (content) content.classList.add('active');

      if (tabId === 'journal-tab') {
        loadJournalStats();
      }
    });
  });

  // Settings Load
  chrome.storage.local.get(['settings'], (result) => {
    const defaultSettings = {
      stake: 1500,
      convergenceThreshold: 0.02,
      cooldownLimit: 3,
      cooldownDuration: 5,
      soundEnabled: true
    };

    const settings = { ...defaultSettings, ...result.settings };

    document.getElementById('stake').value = settings.stake;
    document.getElementById('threshold').value = settings.convergenceThreshold;
    document.getElementById('cooldownLimit').value = settings.cooldownLimit;
    document.getElementById('cooldownDuration').value = settings.cooldownDuration;
    document.getElementById('soundEnabled').checked = settings.soundEnabled;
  });

  // Settings Save
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const stake = parseFloat(document.getElementById('stake').value);
    const threshold = parseFloat(document.getElementById('threshold').value);
    const cooldownLimit = parseInt(document.getElementById('cooldownLimit').value);
    const cooldownDuration = parseInt(document.getElementById('cooldownDuration').value);
    const soundEnabled = document.getElementById('soundEnabled').checked;

    const newSettings = {
      stake,
      convergenceThreshold: threshold,
      cooldownLimit,
      cooldownDuration,
      soundEnabled
    };

    chrome.storage.local.set({ settings: newSettings }, () => {
      const btn = document.getElementById('save-settings-btn');
      const originalText = btn.innerText;
      btn.innerText = "Settings Saved!";
      btn.style.background = "#2ecc71";
      btn.style.color = "#fff";
      
      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = "";
        btn.style.color = "";
      }, 1500);
    });
  });

  // Load Journal Statistics & Log
  async function loadJournalStats() {
    const data = await journal.getData();
    
    // UI elements
    const elWinrate = document.getElementById('stat-winrate');
    const elNetprofit = document.getElementById('stat-netprofit');
    const elTotal = document.getElementById('stat-total');
    const tbody = document.getElementById('trade-log-body');

    if (elWinrate) elWinrate.innerText = `${data.winRate}%`;
    if (elNetprofit) {
      const isNegative = data.netProfit < 0;
      elNetprofit.innerText = `${isNegative ? '-' : ''}$${Math.abs(Math.round(data.netProfit)).toLocaleString()}`;
      elNetprofit.style.color = data.netProfit >= 0 ? '#2ecc71' : '#e74c3c';
    }
    if (elTotal) elTotal.innerText = data.trades.length;

    // Build Table
    if (tbody) {
      if (data.trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-data">No logged trades yet.</td></tr>`;
        return;
      }

      // Sort by newest first (highest timestamp)
      const sortedTrades = [...data.trades].sort((a, b) => b.timestamp - a.timestamp);
      tbody.innerHTML = sortedTrades.map(trade => {
        const date = new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const outcomeClass = `log-outcome-${trade.outcome}`;
        const profitText = trade.profit >= 0 ? `+$${Math.round(trade.profit).toLocaleString()}` : `-$${Math.round(Math.abs(trade.profit)).toLocaleString()}`;
        const profitClass = trade.profit >= 0 ? 'log-outcome-win' : 'log-outcome-loss';
        
        return `
          <tr>
            <td>${date}</td>
            <td>${trade.asset}</td>
            <td class="${outcomeClass}">${trade.outcome.toUpperCase()}</td>
            <td class="${profitClass}">${trade.outcome === 'draw' ? '$0' : profitText}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Clear Journal
  const clearBtn = document.getElementById('clear-journal-btn');
  clearBtn.addEventListener('click', async () => {
    const confirmClear = confirm("Are you sure you want to clear all manual trade logs and statistics?");
    if (confirmClear) {
      await journal.clear();
      loadJournalStats();
    }
  });

});
