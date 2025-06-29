// Background script for handling screen capture and communication
let captureStreamId = null;
let isCapturing = false;
let activeTabId = null;

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action);

  if (message.action === "startCapture") {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    
    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID available for capture" });
      return true;
    }

    // Get the Tab object using the tab ID
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Tab retrieval error:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      activeTabId = tab.id;
      
      // Use desktopCapture API with Tab object
      chrome.desktopCapture.chooseDesktopMedia(
        ['screen', 'window'],
        tab, // Pass the Tab object here
        (streamId) => {
          if (chrome.runtime.lastError) {
            console.error("Desktop Capture Error:", chrome.runtime.lastError);
            sendResponse({ success: false, error: "Screen capture failed: " + chrome.runtime.lastError.message });
            return;
          }

          if (!streamId) {
            sendResponse({ success: false, error: "Screen capture was canceled." });
            return;
          }

          captureStreamId = streamId;
          isCapturing = true;
          
          // Notify content script that capture is ready
          chrome.tabs.sendMessage(activeTabId, {
            action: "startCapture",
            streamId: streamId
          });
          
          sendResponse({ success: true, streamId: streamId });
        }
      );
    });

    return true; // Keep message channel open for async response
  } 
  else if (message.action === "stopCapture") {
    isCapturing = false;
    if (captureStreamId) {
      // Stop the stream
      captureStreamId = null;
      
      // Notify content script if we have an active tab
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { action: "stopCapture" })
          .catch(err => console.error("Error sending stop message:", err));
      }
    }
    sendResponse({ success: true, status: "Recognition stopped" });
  } 
  else if (message.action === "checkApiHealth") {
    // Check API health and send response
    fetch('http://127.0.0.1:5000/health')
      .then(response => {
        if (!response.ok) {
          throw new Error(`API health check failed with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, modelLoaded: data.model_loaded });
      })
      .catch(error => {
        console.error("API Health Check Failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  else if (message.action === "showOverlay") {
    // Forward the show overlay message to the content script
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { action: "showOverlay" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response || { success: true });
        }
      });
    } else {
      // Get current active tab if we don't have it stored
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          chrome.tabs.sendMessage(activeTabId, { action: "showOverlay" }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response || { success: true });
            }
          });
        } else {
          sendResponse({ success: false, error: "No active tab found" });
        }
      });
    }
    return true; // Keep message channel open for async response
  }
  
  return false;
});

// Handle browser action click (fallback for popup)
chrome.action.onClicked.addListener((tab) => {
  // Store the current tab ID
  activeTabId = tab.id;
});

// Handle tab updates to keep track of active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

// Handle tab removal - cleanup if it's our active tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    // Clean up if our active tab is closed
    if (isCapturing) {
      isCapturing = false;
      captureStreamId = null;
    }
    activeTabId = null;
  }
});

// Cleanup
chrome.runtime.onSuspend.addListener(() => {
  console.log("Unloading extension, releasing resources");
  captureStreamId = null;
  isCapturing = false;
  activeTabId = null;
});