// Content script for processing frames and managing overlay
// This version removes TensorFlow.js dependency and uses the Flask API instead

// Global variables
let overlay = null;
let predictionElement = null;
let toggleButton = null;
let isRecognizing = false;
let captureStream = null;
let videoElement = null;
let captureInterval = null;
let letterHistory = [];
let translatedText = "";
const MAX_HISTORY = 5; // Number of predictions to keep for smoothing
const FRAME_INTERVAL = 200; // Process frames every 200ms (5 FPS)

// Initialize content script
function initialize() {
  console.log("PalmSpeak: Content script initializing");
  
  // Create and inject overlay
  createOverlay();
  
  // Listen for messages from background script
  setupMessageListeners();
  
  console.log("PalmSpeak: Content script initialized successfully");
}

// Create and inject the UI overlay
function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'palmspeak-overlay';
  overlay.innerHTML = `
    <div class="palmspeak-container">
      <div class="palmspeak-header">
        <h3>PalmSpeak ASL Translator</h3>
        <button id="palmspeak-toggle" class="palmspeak-button">Start Recognition</button>
      </div>
      <div class="palmspeak-content">
        <div id="palmspeak-prediction" class="palmspeak-prediction">Ready</div>
        <div id="palmspeak-text" class="palmspeak-text"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Store DOM elements and add event listeners
  toggleButton = document.getElementById('palmspeak-toggle');
  predictionElement = document.getElementById('palmspeak-prediction');
  
  toggleButton.addEventListener('click', toggleRecognition);
}

// Start screen capture using getDisplayMedia
async function startScreenCapture() {
  try {
    updateStatus("Requesting screen access...");
    
    // Request user permission to capture the screen
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "never",
        displaySurface: "window"
      },
      audio: false
    });
    
    captureStream = stream;
    
    // Create a video element to process the stream
    videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
    
    await videoElement.play();
    
    updateStatus("Screen capture started");
    
    // Start capturing frames
    captureInterval = setInterval(captureVideoFrame, FRAME_INTERVAL);
    
    // Handle stream ending
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenCapture();
      updateStatus("Screen sharing ended");
      isRecognizing = false;
      toggleButton.textContent = "Start Recognition";
      toggleButton.classList.remove('active');
    });
    
    return { success: true };
  } catch (error) {
    console.error("PalmSpeak: Error starting screen capture:", error);
    updateStatus("Error: " + error.message);
    return { success: false, error: error.message };
  }
}

// Capture a frame from the video stream
function captureVideoFrame() {
  if (!videoElement || !isRecognizing) return;
  
  try {
    // Create a canvas to capture the current frame
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL and process
    const frameData = canvas.toDataURL('image/jpeg', 0.7);
    processFrame(frameData);
  } catch (error) {
    console.error("PalmSpeak: Error capturing frame:", error);
  }
}

// Stop screen capture
function stopScreenCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
  }
  
  if (videoElement) {
    videoElement.srcObject = null;
    if (videoElement.parentNode) {
      videoElement.parentNode.removeChild(videoElement);
    }
    videoElement = null;
  }
  
  console.log("PalmSpeak: Screen capture stopped");
}

// Process a captured frame by sending to the Flask API
async function processFrame(frameData) {
  if (!isRecognizing) return;
  
  try {
    // Check if API is available by trying to reach the health endpoint first
    let healthCheckResponse;
    try {
      healthCheckResponse = await fetch('http://127.0.0.1:5000/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!healthCheckResponse.ok) {
        throw new Error(`API health check failed with status ${healthCheckResponse.status}`);
      }
    } catch (error) {
      console.error("PalmSpeak: API Health Check Failed:", error);
      updateStatus("API unavailable. Is the Flask server running?");
      return;
    }
    
    // Send frame to API for prediction
    const response = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: frameData })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // Update letter history for smoothing
    letterHistory.push(result.letter);
    if (letterHistory.length > MAX_HISTORY) {
      letterHistory.shift();
    }
    
    // Use majority vote for current prediction
    const counts = {};
    let maxCount = 0;
    let majorityLetter = result.letter;
    
    for (const letter of letterHistory) {
      counts[letter] = (counts[letter] || 0) + 1;
      if (counts[letter] > maxCount) {
        maxCount = counts[letter];
        majorityLetter = letter;
      }
    }
    
    // Update UI with prediction
    if (result.confidence > 0.65) {
      updatePrediction(majorityLetter, result.confidence);
    }
    
  } catch (error) {
    console.error("PalmSpeak: Error processing frame:", error);
    updateStatus("API Error: " + error.message);
  }
}

// Update prediction display
function updatePrediction(letter, confidence) {
  if (!predictionElement) return;
  
  predictionElement.textContent = `Detected: ${letter} (${Math.round(confidence * 100)}%)`;
  predictionElement.classList.add('flash');
  
  // Remove flash animation after it completes
  setTimeout(() => {
    predictionElement.classList.remove('flash');
  }, 500);
  
  // If this is a special character, handle it
  if (letter === 'space') {
    addToTranslatedText(' ');
  } else if (letter === 'del') {
    removeLastCharacter();
  } else if (letter !== 'nothing') {
    addToTranslatedText(letter);
  }
}

// Add a letter to the translated text
function addToTranslatedText(letter) {
  const textElement = document.getElementById('palmspeak-text');
  if (!textElement) return;
  
  // Check if the last character is the same (avoid duplicates)
  if (translatedText.length === 0 || translatedText.slice(-1) !== letter || letter === ' ') {
    translatedText += letter;
    textElement.textContent = translatedText;
  }
}

// Remove the last character from the translated text
function removeLastCharacter() {
  const textElement = document.getElementById('palmspeak-text');
  if (!textElement) return;
  
  if (translatedText.length > 0) {
    translatedText = translatedText.slice(0, -1);
    textElement.textContent = translatedText;
  }
}

// Update status message
function updateStatus(message) {
  if (predictionElement) {
    predictionElement.textContent = message;
  }
}

// Toggle recognition on/off
async function toggleRecognition() {
  if (isRecognizing) {
    // Stop recognition
    isRecognizing = false;
    updateStatus("Recognition stopped");
    toggleButton.textContent = "Start Recognition";
    toggleButton.classList.remove('active');
    
    // Stop capture
    stopScreenCapture();
    chrome.runtime.sendMessage({ action: "stopCapture" });
  } else {
    // Start recognition
    updateStatus("Starting recognition...");
    toggleButton.textContent = "Stop Recognition";
    toggleButton.classList.add('active');
    
    // Clear the text
    const textElement = document.getElementById('palmspeak-text');
    if (textElement) textElement.textContent = '';
    translatedText = '';
    
    // Reset letter history
    letterHistory = [];
    
    // Check API connection
    try {
      const healthResponse = await fetch('http://127.0.0.1:5000/health');
      if (!healthResponse.ok) {
        throw new Error(`API health check failed with status ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      if (!healthData.model_loaded) {
        throw new Error("Model not loaded on the server side");
      }
    } catch (error) {
      updateStatus("API Error: " + error.message);
      toggleButton.textContent = "Start Recognition";
      toggleButton.classList.remove('active');
      return;
    }
    
    // Start capture via background script to coordinate
    chrome.runtime.sendMessage({ action: "startCapture" }, (response) => {
      if (!response || !response.success) {
        updateStatus("Failed to start: " + (response?.error || "Unknown error"));
        toggleButton.textContent = "Start Recognition";
        toggleButton.classList.remove('active');
      } else {
        isRecognizing = true;
      }
    });
  }
}

// Set up message listeners for background script communication
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("PalmSpeak content script received message:", message.action);
    
    if (message.action === "startDisplayCapture") {
      startScreenCapture().then(sendResponse);
      return true; // Keep channel open for async response
    }
    
    if (message.action === "stopDisplayCapture") {
      stopScreenCapture();
      sendResponse({ success: true });
    }
    
    if (message.action === "getModelStatus") {
      // Check API connection
      fetch('http://127.0.0.1:5000/health')
        .then(response => {
          if (!response.ok) {
            throw new Error(`API health check failed with status ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          sendResponse({ modelLoaded: data.model_loaded });
        })
        .catch(error => {
          console.error("PalmSpeak: API Health Check Failed:", error);
          sendResponse({ modelLoaded: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }
    
    return true;
  });
}

// Initialize on load
window.addEventListener('load', initialize);

// Also initialize if page is already loaded
if (document.readyState === "complete") {
  initialize();
}