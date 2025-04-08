// Keep track of tabs with content scripts loaded
let teamsTabsWithContentScript = {};

// Listen for content script initialization messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "contentScriptReady") {
        console.log("Content script ready in tab:", sender.tab.id);
        teamsTabsWithContentScript[sender.tab.id] = true;
        sendResponse({status: "Background script acknowledged content script is ready"});
        return true;
    }
    
    if (message.action === "toggleCapture") {
        console.log("Background script received toggleCapture message");
        // Forward the message to the content script in the active tab
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) {
                console.error("No active tab found");
                sendResponse({status: "Error: No active tab found", error: true});
                return;
            }
            
            const activeTab = tabs[0];
            
            // Check if we need to inject the content script first
            if (!teamsTabsWithContentScript[activeTab.id] && 
                activeTab.url && 
                activeTab.url.includes("teams.live.com")) {
                
                console.log("Injecting content script into tab:", activeTab.id);
                
                // Try to inject the content script
                chrome.scripting.executeScript({
                    target: {tabId: activeTab.id},
                    files: ["content.js"]
                }, (injectionResults) => {
                    if (chrome.runtime.lastError) {
                        console.error("Script injection failed:", chrome.runtime.lastError.message);
                        sendResponse({
                            status: "Error: Could not inject content script", 
                            error: true
                        });
                        return;
                    }
                    
                    console.log("Content script injected, waiting for ready signal");
                    
                    // Wait a bit for the content script to initialize
                    setTimeout(() => {
                        forwardMessageToContentScript(activeTab.id, message, sendResponse);
                    }, 1000);
                });
            } else {
                // Content script should already be there, forward message directly
                forwardMessageToContentScript(activeTab.id, message, sendResponse);
            }
        });
        return true; // Keep the message channel open for the async response
    }
});

// Helper function to forward messages to content script
function forwardMessageToContentScript(tabId, message, sendResponse) {
    console.log("Forwarding message to tab:", tabId);
    chrome.tabs.sendMessage(
        tabId, 
        {action: message.status ? "startCapture" : "stopCapture"},
        (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending message to content script:", chrome.runtime.lastError.message);
                sendResponse({
                    status: "Error: Content script not responding. Make sure you're on a Teams call page.", 
                    error: true
                });
                return;
            }
            
            if (response) {
                console.log("Content script responded:", response);
                sendResponse(response);
            } else {
                sendResponse({status: "No response from content script", error: true});
            }
        }
    );
}

// Track when tabs are closed to clean up our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
    if (teamsTabsWithContentScript[tabId]) {
        delete teamsTabsWithContentScript[tabId];
    }
});

// When extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("PalmSpeak extension installed/updated");
});