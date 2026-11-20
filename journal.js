// journal.js - persistent trade journal object
class TradeJournal {
  constructor() {
    this.STORAGE_KEY = 'agJournalData_v2';
  }

  async getData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        const defaultData = {
          trades: [], // Array of { timestamp, asset, outcome, profit }
          wins: 0,
          losses: 0,
          draws: 0,
          total: 0,
          winRate: 0,
          netProfit: 0
        };
        if (result[this.STORAGE_KEY]) {
          resolve({ ...defaultData, ...result[this.STORAGE_KEY] });
        } else {
          resolve(defaultData);
        }
      });
    });
  }

  async logTrade(asset, outcome, stake) {
    const data = await this.getData();
    let profit = 0;
    if (outcome === 'win') {
      data.wins++;
      profit = stake * 0.85; // assume standard 85% payout
    } else if (outcome === 'loss') {
      data.losses++;
      profit = -stake;
    } else if (outcome === 'draw') {
      data.draws++;
    }
    
    data.total = data.wins + data.losses + data.draws;
    const calculableTrades = data.wins + data.losses;
    data.winRate = calculableTrades > 0 ? Math.round((data.wins / calculableTrades) * 100) : 0;
    data.netProfit += profit;

    data.trades.push({
      timestamp: Date.now(),
      asset: asset || "Unknown",
      outcome,
      profit
    });

    // limit log to last 50 trades
    if (data.trades.length > 50) {
      data.trades.shift();
    }

    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: data }, () => {
        resolve(data);
      });
    });
  }

  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([this.STORAGE_KEY], () => {
        resolve();
      });
    });
  }
}

// Bind to window for injection contexts if needed
window.TradeJournal = TradeJournal;
window.agJournalInstance = new TradeJournal();
