// Popup script for PalmSpeak ASL Translator
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const statusText = document.getElementById('status-text');
const modelStatus = document.getElementById('model-status');

let isCapturing = false;
let activeTabId = null;

// Update status in UI
function updateStatus(message) {
  statusText.textContent = message;
}

// Update model status with styling
function updateModelStatus(message, isError = false) {
  modelStatus.textContent = message;
  modelStatus.classList.toggle('error', isError);
  modelStatus.classList.toggle('model-loaded', message === "Loaded");
}

// Check Flask API health
async function checkApiHealth() {
  try {
    updateModelStatus("Checking...");
    const response = await chrome.runtime.sendMessage({ action: "checkApiHealth" });
    
    if (response?.success) {
      updateModelStatus(response.modelLoaded ? "Loaded" : "Not Loaded", !response.modelLoaded);
      return response.modelLoaded;
    }
    updateModelStatus("API Error", true);
    return false;
  } catch (error) {
    console.error('API health check failed:', error);
    updateModelStatus("Connection Error", true);
    return false;
  }
}

// Get current active tab
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId = tab.id;
      return tab;
    }
    throw new Error("No active tab found");
  } catch (error) {
    console.error("Tab retrieval error:", error);
    updateStatus("Error: Cannot access active tab");
    return null;
  }
}

// Start recognition process
async function startRecognition() {
  startButton.disabled = true;
  updateStatus('Starting recognition...');

  try {
    const tab = await getCurrentTab();
    if (!tab) {
      startButton.disabled = false;
      return;
    }

    // Use Promise wrapper for sendMessage
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "startCapture", tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response?.success) {
      isCapturing = true;
      updateStatus('Recognition active');
      stopButton.disabled = false;
      startButton.disabled = true;
    } else {
      throw new Error(response?.error || 'Failed to start recognition');
    }
  } catch (error) {
    console.error('Recognition start failed:', error);
    startButton.disabled = false;
    updateStatus(`Error: ${error.message}`);
  }
}

// Stop recognition process
async function stopRecognition() {
  startButton.disabled = false;
  stopButton.disabled = true;
  updateStatus('Stopping recognition...');

  try {
    const response = await chrome.runtime.sendMessage({ action: "stopCapture" });
    if (response?.success) {
      isCapturing = false;
      updateStatus('Recognition stopped');
    } else {
      throw new Error(response?.error || 'Failed to stop recognition');
    }
  } catch (error) {
    console.error('Recognition stop failed:', error);
    updateStatus(`Error: ${error.message}`);
  }
}

// Initialize UI and checks
document.addEventListener('DOMContentLoaded', async () => {
  startButton.addEventListener('click', startRecognition);
  stopButton.addEventListener('click', stopRecognition);

  // Initial state
  startButton.disabled = true;
  stopButton.disabled = true;
  updateStatus("Initializing...");

  // Check API status
  const isApiHealthy = await checkApiHealth();
  
  if (isApiHealthy) {
    updateStatus("Ready");
    startButton.disabled = false;
  } else {
    updateStatus("API unavailable");
  }

  // Get current tab context
  await getCurrentTab();
});