// background.js – handles optional WebSocket interception via webRequest
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Forward raw request body to content script if needed
    // For now we just pass the URL to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'ws-request', url: details.url});
      }
    });
    return {};
  },
  {urls: ["*://*.pocketoption.com/*"], types: ["websocket"]},
  []
);

// Listen for messages from content script and forward to strategy (if needed)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'price-data') {
    // broadcast to all tabs running the extension
    chrome.tabs.query({url: '*://*.pocketoption.com/*'}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg);
      });
    });
  }
});
