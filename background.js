// Background script for handling screen capture and communication

// Store active tab ID and capture state
let activeTabId = null;
let isCapturing = false;

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action);
  
  // Handle requests to start screen capture
  if (message.action === "startCapture") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }
      
      // Check if the tab is a Teams or Zoom tab
      const url = tabs[0].url;
      if (!url || !(url.includes("teams.live.com") || 
                    url.includes("teams.microsoft.com") || 
                    url.includes("zoom.us"))) {
        sendResponse({ success: false, error: "Please navigate to Microsoft Teams or Zoom" });
        return;
      }
      
      // First check if Flask API is available
      try {
        const apiResponse = await fetch('http://127.0.0.1:5000/health');
        if (!apiResponse.ok) {
          sendResponse({ success: false, error: "Flask API not available" });
          return;
        }
        
        const apiStatus = await apiResponse.json();
        if (!apiStatus.model_loaded) {
          sendResponse({ success: false, error: "ASL model not loaded on server" });
          return;
        }
      } catch (error) {
        console.error("API health check failed:", error);
        sendResponse({ success: false, error: "Cannot connect to Flask API" });
        return;
      }
      
      activeTabId = tabs[0].id;
      isCapturing = true;
      
      // Send message to content script to start capture using getDisplayMedia
      chrome.tabs.sendMessage(activeTabId, { action: "startDisplayCapture" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error communicating with content script:", chrome.runtime.lastError);
          sendResponse({ success: false, error: "Failed to communicate with page" });
          isCapturing = false;
          return;
        }
        
        sendResponse(response);
      });
    });
    return true; // Keep message channel open for async response
  }
  
  // Handle requests to stop screen capture
  if (message.action === "stopCapture") {
    isCapturing = false;
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { action: "stopDisplayCapture" }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error stopping capture:", chrome.runtime.lastError);
        }
      });
    }
    sendResponse({ success: true });
  }
  
  // Handle status check requests
  if (message.action === "getCaptureStatus") {
    sendResponse({ isCapturing: isCapturing });
  }
  
  // Handle API health check
  if (message.action === "checkApiHealth") {
    fetch('http://127.0.0.1:5000/health')
      .then(response => {
        if (!response.ok) {
          throw new Error(`API health check failed with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ healthy: true, modelLoaded: data.model_loaded });
      })
      .catch(error => {
        console.error("API Health Check Failed:", error);
        sendResponse({ healthy: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  // Handle toggle capture requests from popup
  if (message.action === "toggleCapture") {
    if (message.status) {
      // Start capture
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0) {
          sendResponse({ error: true, status: "No active tab found" });
          return;
        }
        
        // Check if the tab is a Teams or Zoom tab
        const url = tabs[0].url;
        if (!url || !(url.includes("teams.live.com") || 
                      url.includes("teams.microsoft.com") || 
                      url.includes("zoom.us"))) {
          sendResponse({ error: true, status: "Please navigate to Microsoft Teams or Zoom" });
          return;
        }
        
        // Check API health before starting capture
        try {
          const apiResponse = await fetch('http://127.0.0.1:5000/health');
          if (!apiResponse.ok) {
            sendResponse({ error: true, status: "Flask API not available" });
            return;
          }
          
          const apiStatus = await apiResponse.json();
          if (!apiStatus.model_loaded) {
            sendResponse({ error: true, status: "ASL model not loaded on server" });
            return;
          }
        } catch (error) {
          console.error("API health check failed:", error);
          sendResponse({ error: true, status: "Cannot connect to Flask API" });
          return;
        }
        
        activeTabId = tabs[0].id;
        isCapturing = true;
        
        chrome.tabs.sendMessage(activeTabId, { action: "startDisplayCapture" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: true, status: "Failed to communicate with page" });
            isCapturing = false;
            return;
          }
          
          if (response && response.success) {
            sendResponse({ error: false, status: "Recognition active" });
          } else {
            sendResponse({ error: true, status: response?.error || "Failed to start capture" });
            isCapturing = false;
          }
        });
      });
    } else {
      // Stop capture
      isCapturing = false;
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { action: "stopDisplayCapture" }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error stopping capture:", chrome.runtime.lastError);
          }
        });
      }
      sendResponse({ error: false, status: "Recognition stopped" });
    }
    return true; // Keep message channel open for async response
  }
});

// Tab removed/changed handling
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    isCapturing = false;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === "loading") {
    // Tab is navigating away, stop capture
    isCapturing = false;
  }
});

// Cleanup when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  if (activeTabId && isCapturing) {
    chrome.tabs.sendMessage(activeTabId, { action: "stopDisplayCapture" }).catch(() => {});
    isCapturing = false;
  }
});