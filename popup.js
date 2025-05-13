// Popup script for PalmSpeak ASL Translator

// DOM elements
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const statusText = document.getElementById('status-text');
const modelStatus = document.getElementById('model-status');

// Check for active Teams or Zoom tab
async function checkActiveTab() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.url) {
      updateStatus('No active tab found');
      disableButtons();
      return false;
    }
    
    const isValidTab = 
      activeTab.url.includes('teams.live.com') || 
      activeTab.url.includes('teams.microsoft.com') ||
      activeTab.url.includes('zoom.us');
    
    if (!isValidTab) {
      updateStatus('Please navigate to Microsoft Teams or Zoom');
      disableButtons();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking active tab:', error);
    updateStatus('Error: ' + error.message);
    disableButtons();
    return false;
  }
}

// Check Flask API health status
async function checkApiHealth() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "checkApiHealth" });
    
    if (!response || !response.healthy) {
      modelStatus.textContent = "API Unavailable";
      modelStatus.classList.remove('model-loaded');
      modelStatus.classList.add('error');
      disableButtons();
      return false;
    }
    
    if (response.modelLoaded) {
      modelStatus.textContent = "Model Loaded";
      modelStatus.classList.add('model-loaded');
      modelStatus.classList.remove('error');
    } else {
      modelStatus.textContent = "Model Not Loaded";
      modelStatus.classList.remove('model-loaded');
      disableButtons();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking API health:', error);
    modelStatus.textContent = "API Error";
    modelStatus.classList.add('error');
    modelStatus.classList.remove('model-loaded');
    disableButtons();
    return false;
  }
}

// Check capture status 
async function checkCaptureStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "getCaptureStatus" });
    
    if (response && response.isCapturing) {
      // Update UI to show as capturing
      startButton.disabled = true;
      stopButton.disabled = false;
      updateStatus('Recognition active');
    } else {
      // Update UI to show as not capturing
      startButton.disabled = false;
      stopButton.disabled = true;
      updateStatus('Ready');
    }
  } catch (error) {
    console.error('Error checking capture status:', error);
    updateStatus('Error checking status');
  }
}

// Initialize the popup
async function initialize() {
  // Add event listeners
  startButton.addEventListener('click', startRecognition);
  stopButton.addEventListener('click', stopRecognition);
  
  // Check if we're on a Teams or Zoom tab
  const isValidTab = await checkActiveTab();
  if (!isValidTab) return;
  
  // Check API health
  const isApiHealthy = await checkApiHealth();
  if (!isApiHealthy) return;
  
  // Check current capture status
  await checkCaptureStatus();
}

// Start recognition
async function startRecognition() {
  if (!await checkActiveTab()) return;
  if (!await checkApiHealth()) return;
  
  updateStatus('Starting recognition...');
  startButton.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: "startCapture" });
    
    if (response && response.success) {
      stopButton.disabled = false;
      updateStatus('Recognition active');
    } else {
      startButton.disabled = false;
      updateStatus('Error: ' + (response?.error || 'Failed to start'));
    }
  } catch (error) {
    console.error('Error starting recognition:', error);
    startButton.disabled = false;
    updateStatus('Error: ' + error.message);
  }
}

// Stop recognition
async function stopRecognition() {
  updateStatus('Stopping recognition...');
  stopButton.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: "stopCapture" });
    
    if (response && response.success) {
      startButton.disabled = false;
      updateStatus('Recognition stopped');
    } else {
      stopButton.disabled = false;
      updateStatus('Error stopping recognition');
    }
  } catch (error) {
    console.error('Error stopping recognition:', error);
    stopButton.disabled = false;
    updateStatus('Error: ' + error.message);
  }
}

// Update status text
function updateStatus(message) {
  statusText.textContent = message;
}

// Disable all buttons
function disableButtons() {
  startButton.disabled = true;
  stopButton.disabled = true;
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', initialize);