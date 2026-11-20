(function() {
  console.log("[PO-Signal-Assistant] Injecting WebSocket Interceptor...");

  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = function(url, protocols) {
    console.log("[PO-Signal-Assistant] WebSocket Connection opened:", url);
    const ws = new OriginalWebSocket(url, protocols);

    let lastBinaryEvent = null;
    ws.addEventListener('message', function(event) {
      const rxTime = performance.now();
      try {
        const rawData = event.data;
        
        let msgType = typeof rawData;
        let prefix = "";
        if (typeof rawData === 'string') {
          prefix = rawData.substring(0, 50);
        } else if (rawData instanceof ArrayBuffer) {
          msgType = "ArrayBuffer";
          prefix = `ByteLength: ${rawData.byteLength}`;
        } else if (rawData instanceof Blob) {
          msgType = "Blob";
          prefix = `Size: ${rawData.size}`;
        }
        
        console.log(`[PO-Signal-Assistant] Raw WS Message: Type=${msgType}, Data=${prefix}`);

        let jsonStr = null;
        if (typeof rawData === 'string') {
          if (rawData.startsWith('42')) {
            jsonStr = rawData.substring(2);
          } else if (rawData.startsWith('45')) {
            // Binary event format: "45[attachmentCount]-[JSON]"
            const dashIdx = rawData.indexOf('-');
            if (dashIdx !== -1) {
              jsonStr = rawData.substring(dashIdx + 1);
            }
          }
        }

        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length >= 1) {
            const eventName = parsed[0];
            const eventData = parsed[1];
            
            console.log("[PO-Signal-Assistant] Intercepted eventName:", eventName);

            if (eventName === 'updateStream' || eventName === 'updateHistoryNewFast' || eventName === 'successauth' || eventName === 'auth/success') {
              if (rawData.startsWith('45')) {
                lastBinaryEvent = eventName;
              } else {
                lastBinaryEvent = null;
                window.postMessage({
                  source: 'PO_WS_INCOMING',
                  event: eventName,
                  data: eventData,
                  rxTime: rxTime
                }, '*');
              }
            } else {
              lastBinaryEvent = null;
            }
          }
        } else if (rawData instanceof ArrayBuffer || rawData instanceof Blob) {
          if (lastBinaryEvent) {
            console.log(`[PO-Signal-Assistant] Decoding binary payload for event: ${lastBinaryEvent}`);
            
            // Decodes UTF-8 text from raw binary buffer
            let decodedData = null;
            try {
              let buffer = rawData;
              if (rawData instanceof Blob) {
                // If it's a Blob, we'd need async parsing, but pocket option normally uses ArrayBuffer.
                // We handle ArrayBuffer sync decoding here.
              } else {
                const decoder = new TextDecoder('utf-8');
                const text = decoder.decode(buffer);
                decodedData = JSON.parse(text);
              }
            } catch (e) {
              console.warn("[PO-Signal-Assistant] Failed to parse binary attachment as JSON:", e);
            }

            if (decodedData) {
              console.log(`[PO-Signal-Assistant] Decoded binary event '${lastBinaryEvent}' successfully:`, decodedData);
              window.postMessage({
                source: 'PO_WS_INCOMING',
                event: lastBinaryEvent,
                data: decodedData,
                rxTime: rxTime
              }, '*');
            }

            lastBinaryEvent = null;
          }
        }
      } catch (err) {
        console.error("[PO-Signal-Assistant] Message parse error:", err);
      }
    });

    const originalSend = ws.send;
    ws.send = function(data) {
      try {
        if (typeof data === 'string' && data.startsWith('42')) {
          const jsonStr = data.substring(2);
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length >= 1) {
            const eventName = parsed[0];
            const eventData = parsed[1];

            console.log("[PO-Signal-Assistant] Intercepted outgoing eventName:", eventName, eventData);

            if (eventName === 'changeSymbol' || eventName === 'subscribeSymbol') {
              window.postMessage({
                source: 'PO_WS_OUTGOING',
                event: eventName,
                data: eventData
              }, '*');
            }
          }
        }
      } catch (err) {
        console.error("[PO-Signal-Assistant] Outgoing parse error:", err);
      }
      return originalSend.apply(this, arguments);
    };

    return ws;
  };

  window.WebSocket.prototype = OriginalWebSocket.prototype;
  console.log("[PO-Signal-Assistant] WebSocket Interceptor loaded.");
})();
