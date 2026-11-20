// audio.js – Web Audio API alarm synthesis (lazy loaded)
window.agAudio = (function() {
  let ctx = null;
  function getContext() {
    return ctx;
  }
  function playTone(freq, duration, startTimeOffset = 0, type = 'sine') {
    try {
      const c = getContext();
      if (!c || c.state === 'suspended') return;
      
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      
      const now = c.currentTime + startTimeOffset;
      // Linear volume ramp to avoid clicks (attack/decay phases)
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.005);
      gain.gain.setValueAtTime(0.2, now + duration - 0.015);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      
      osc.connect(gain);
      gain.connect(c.destination);
      
      osc.start(now);
      osc.stop(now + duration);
      
      // Cleanup node connections to prevent memory leaks and garbage collect nodes
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch (e) {
      console.warn("[PO-Signal-Assistant] Audio playback failed:", e);
    }
  }
  function playBuy() {
    // rising double‑beep: 400Hz → 600Hz (0.12s each) scheduled precisely in time
    playTone(400, 0.12, 0);
    playTone(600, 0.12, 0.14);
  }
  function playSell() {
    // descending triangle wave sweep: 800Hz → 400Hz over 0.25s
    try {
      const c = getContext();
      if (!c || c.state === 'suspended') return;
      
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      
      const now = c.currentTime;
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.25);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.005);
      gain.gain.setValueAtTime(0.2, now + 0.235);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      
      osc.connect(gain);
      gain.connect(c.destination);
      
      osc.start(now);
      osc.stop(now + 0.25);
      
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch (e) {
      console.warn("[PO-Signal-Assistant] Audio sweep playback failed:", e);
    }
  }
  function unlock() {
    try {
      // Strictly construct the AudioContext inside the user-gesture click handler to satisfy browser policy
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[PO-Signal-Assistant] AudioContext successfully created via user gesture.");
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log("[PO-Signal-Assistant] AudioContext successfully unlocked and running.");
        }).catch(err => {
          console.warn("[PO-Signal-Assistant] AudioContext unlock failed:", err);
        });
      }
    } catch (e) {
      console.warn("[PO-Signal-Assistant] AudioContext unlock exception:", e);
    }
  }
  return {playBuy, playSell, unlock};
})();
