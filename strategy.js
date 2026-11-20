// strategy.js – Alligator indicator calculation and live analysis
console.log("[PO-Signal-Assistant] strategy.js loading...");

function canonicalizeSymbol(symbol) {
  if (!symbol) return "";
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

class AlligatorStrategy {
  constructor() {
    this.candles = [];
    this.timeframe = 5; // seconds per candle
    this.maxCandles = 200;
    this.activeAsset = "";
  }

  setActiveAsset(asset) {
    if (canonicalizeSymbol(this.activeAsset) !== canonicalizeSymbol(asset)) {
      console.log(`[PO-Signal-Assistant] strategy.js: Switching active asset to ${asset}`);
      this.activeAsset = asset;
      this.candles = []; // clear history for the new asset
    }
  }

  setHistory(historyList) {
    if (!Array.isArray(historyList)) return;
    this.candles = historyList.map(item => {
      let time, open, high, low, close;
      if (item.length >= 5) {
        [time, open, high, low, close] = item;
      } else if (item.length === 2) {
        time = item[0];
        open = high = low = close = item[1];
      }
      return {time, open, high, low, close};
    }).filter(Boolean);
    this.candles.sort((a,b)=>a.time-b.time);
    if (this.candles.length > this.maxCandles) this.candles = this.candles.slice(-this.maxCandles);
    console.log(`[PO-Signal-Assistant] strategy.js: Stored ${this.candles.length} candles in strategy state`);
  }

  addTick(price, timestamp) {
    if (this.candles.length===0) {
      const time = Math.floor(timestamp/this.timeframe)*this.timeframe;
      this.candles.push({time, open:price, high:price, low:price, close:price});
      return false;
    }
    const curTime = Math.floor(timestamp/this.timeframe)*this.timeframe;
    const last = this.candles[this.candles.length-1];
    if (curTime===last.time) {
      last.close = price;
      if (price>last.high) last.high=price;
      if (price<last.low) last.low=price;
      return false;
    }
    if (curTime>last.time) {
      this.candles.push({time:curTime, open:price, high:price, low:price, close:price});
      if (this.candles.length>this.maxCandles) this.candles.shift();
      return true;
    }
    return false;
  }

  calculateSMMA(prices, period) {
    const n = prices.length;
    const smma = new Array(n).fill(null);
    if (n<period) return smma;
    let sum=0;
    for(let i=0;i<period;i++) sum+=prices[i];
    smma[period-1]=sum/period;
    for(let i=period;i<n;i++) {
      smma[i] = (smma[i-1]*(period-1)+prices[i])/period;
    }
    return smma;
  }

  calculateIndicators() {
    const closes=this.candles.map(c=>c.close);
    const n=closes.length;
    if (n<19) return null;
    const smma12=this.calculateSMMA(closes,12);
    const smma7=this.calculateSMMA(closes,7);
    const smma4=this.calculateSMMA(closes,4);
    const jaws=[]; const teeth=[]; const lips=[];
    for(let i=0;i<n;i++) {
      jaws.push(i>=7?smma12[i-7]:null);
      teeth.push(i>=4?smma7[i-4]:null);
      lips.push(i>=2?smma4[i-2]:null);
    }
    return {jaws, teeth, lips};
  }

  analyze(convergenceThresholdPercent=0.02) {
    const ind=this.calculateIndicators();
    if (!ind) return {signal:'NO TRADE',confidence:0,reason:'Gathering history...',jaws:null,teeth:null,lips:null};
    const {jaws, teeth, lips}=ind;
    const n=this.candles.length;
    const price=this.candles[n-1].close;
    const curJaws=jaws[n-1]; const curTeeth=teeth[n-1]; const curLips=lips[n-1];
    const prevJaws=jaws[n-2]; const prevTeeth=teeth[n-2]; const prevLips=lips[n-2];
    const prev2Jaws=jaws[n-3]||prevJaws; const prev2Teeth=teeth[n-3]||prevTeeth; const prev2Lips=lips[n-3]||prevLips;
    if (!curJaws||!curTeeth||!curLips||!prevJaws||!prevTeeth||!prevLips) {
      return {signal:'NO TRADE',confidence:0,reason:'Calculating initial averages...',jaws:curJaws,teeth:curTeeth,lips:curLips};
    }
    const maxLine=Math.max(curJaws,curTeeth,curLips);
    const minLine=Math.min(curJaws,curTeeth,curLips);
    const spread=(maxLine-minLine)/price;
    const isConverged=spread<=convergenceThresholdPercent/100;
    let buy=0, sell=0; const buyR=[]; const sellR=[];
    // Lips above both
    if (curLips>curTeeth && curLips>curJaws) {buy+=2; buyR.push('Lips above Teeth & Jaws');}
    // Lips below both
    if (curLips<curTeeth && curLips<curJaws) {sell+=2; sellR.push('Lips below Teeth & Jaws');}
    // Teeth direction
    if (curTeeth>prevTeeth) {buy+=2; buyR.push('Teeth sloping up');}
    else if (curTeeth<prevTeeth) {sell+=2; sellR.push('Teeth sloping down');}
    // Jaws break
    if (price>curJaws && curLips>curJaws) {buy+=2; buyR.push('Price & Lips above Jaws');}
    else if (price<curJaws && curLips<curJaws) {sell+=2; sellR.push('Price & Lips below Jaws');}
    // Mouth opening
    const buySep=curLips-curTeeth; const prevBuySep=prevLips-prevTeeth;
    if (buySep>prevBuySep && buySep>0) {buy+=2; buyR.push('Mouth opening upward');}
    const sellSep=curTeeth-curLips; const prevSellSep=prevTeeth-prevLips;
    if (sellSep>prevSellSep && sellSep>0) {sell+=2; sellR.push('Mouth opening downward');}
    // Candle confirmation
    const lastCandle=this.candles[n-2];
    if (lastCandle) {
      if (lastCandle.close>lastCandle.open) {buy+=1; buyR.push('Bullish closed candle');}
      else if (lastCandle.close<lastCandle.open) {sell+=1; sellR.push('Bearish closed candle');}
      const range=Math.max(lastCandle.high-lastCandle.low,0.00001);
      const upperWick=lastCandle.high-Math.max(lastCandle.open,lastCandle.close);
      const lowerWick=Math.min(lastCandle.open,lastCandle.close)-lastCandle.low;
      if (upperWick/range<0.35) buy+=1; else buyR.push('Upper wick rejection');
      if (lowerWick/range<0.35) sell+=1; else sellR.push('Lower wick rejection');
    }
    let signal='NO TRADE', confidence=0, reason='';
    if (isConverged) {signal='NO TRADE'; confidence=5; reason='Lines converged, waiting breakout';}
    else if (buy>=sell) {
      confidence=Math.min(buy,10);
      if (confidence>=7) {signal='BUY'; reason=buyR.join('; ');} else {signal='NO TRADE'; reason='Weak bullish, conf '+confidence;}
    } else {
      confidence=Math.min(sell,10);
      if (confidence>=7) {signal='SELL'; reason=sellR.join('; ');} else {signal='NO TRADE'; reason='Weak bearish, conf '+confidence;}
    }
    return {signal, confidence, reason, jaws:curJaws, teeth:curTeeth, lips:curLips, spread:spread*100};
  }
}
window.AlligatorStrategy = AlligatorStrategy;

// Runtime bootstrap – listen for intercepted WebSocket messages and feed the strategy
(() => {
  const strat = new AlligatorStrategy();
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.source !== 'PO_WS_INCOMING') return;
    const {event, data, rxTime} = e.data;
    
    if (event === 'updateHistoryNewFast') {
      if (data && data.asset && Array.isArray(data.history)) {
        console.log(`[PO-Signal-Assistant] strategy.js: Received history data for ${data.asset} (${data.history.length} candles)`);
        strat.setActiveAsset(data.asset);
        strat.setHistory(data.history);
      } else {
        console.warn("[PO-Signal-Assistant] strategy.js: Received invalid updateHistoryNewFast structure:", data);
      }
    } else if (event === 'updateStream') {
      if (Array.isArray(data)) {
        console.log(`[PO-Signal-Assistant] strategy.js: Received updateStream with ${data.length} items. Active: ${strat.activeAsset}`);
        if (data.length > 0) {
          console.log(`[PO-Signal-Assistant] strategy.js: First tick in batch:`, data[0]);
        }
        
        // We receive ticks for multiple assets. Find the active asset tick.
        const activeTick = data.find(item => 
          Array.isArray(item) && item.length >= 3 && canonicalizeSymbol(item[0]) === canonicalizeSymbol(strat.activeAsset)
        );
        
        if (activeTick) {
          const [assetName, ts, price] = activeTick;
          console.log(`[PO-Signal-Assistant] strategy.js: Found matching active tick: price=${price}, ts=${ts}`);
          
          // Dispatch price tick event for real-time display
          const tickEv = new CustomEvent('agPriceTick', { detail: { price, timestamp: ts, rxTime } });
          window.dispatchEvent(tickEv);

          const candleClosed = strat.addTick(price, ts);
          if (candleClosed) {
            const analysis = strat.analyze();
            analysis.rxTime = rxTime;
            console.log(`[PO-Signal-Assistant] strategy.js: 5s candle closed. Calculated signal: ${analysis.signal} (Conf: ${analysis.confidence})`);
            const ev = new CustomEvent('agStrategyUpdate', {detail: analysis});
            window.dispatchEvent(ev);
          }
        }
      }
    }
  });
})();
