// Content script for PalmSpeak ASL Translator

// Global variables
let overlay = null;
let predictionElement = null;
let translationElement = null;
let isRecognizing = false;
let captureStream = null;
let videoElement = null;
let captureInterval = null;
let letterHistory = [];
let translatedText = "";
let lastDetectedLetter = null; // Track the last detected letter
let letterConfirmationCount = 0; // Count how many times we've seen the same letter
let isOverlayMinimized = false; // Track overlay state
const MAX_HISTORY = 5; // Number of predictions to keep for smoothing
const FRAME_INTERVAL = 500; // Process frames every 500ms
const CONFIRMATION_THRESHOLD = 3; // How many times we need to see a letter before confirming it

// Initialize content script
function initialize() {
  console.log("PalmSpeak: Content script initializing");

  // Create and inject overlay
  createOverlay();

  // Listen for messages from background script
  setupMessageListeners();

  console.log("PalmSpeak: Content script initialized successfully");
}

// Enhanced overlay creation with better accessibility
function createOverlay() {
  // Remove existing overlay if it exists
  const existingOverlay = document.getElementById('palmspeak-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  overlay = document.createElement('div');
  overlay.id = 'palmspeak-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'PalmSpeak Sign Language Translator');
  overlay.innerHTML = `
    <div class="palmspeak-container">
      <div class="palmspeak-header">
        <h3>PalmSpeak Sign-Language Translator</h3>
        <div>
          <button id="palmspeak-minimize" class="palmspeak-button minimize-button" title="Minimize overlay" aria-label="Minimize overlay">−</button>
          <button id="palmspeak-clear" class="palmspeak-button" style="margin-right: 6px;" aria-label="Clear translation">Clear</button>
          <button id="palmspeak-toggle" class="palmspeak-button" aria-label="Start recognition">Start</button>
        </div>
      </div>
      <div class="palmspeak-content" id="palmspeak-content">
        <div id="palmspeak-prediction" class="palmspeak-prediction" aria-live="polite">...</div>
        <div class="palmspeak-text-display">
          <div class="palmspeak-label">Translation:</div>
          <div id="palmspeak-translation-text" class="palmspeak-text" aria-live="polite">No translation yet</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // Store references to elements
  predictionElement = document.getElementById('palmspeak-prediction');
  translationElement = document.getElementById('palmspeak-translation-text');
  
  // Add event listeners with improved error handling
  setupOverlayEventListeners();
  
  // Initially hide the overlay (will be shown when user clicks "Show Overlay" in popup)
  overlay.style.display = 'none';
}

// Separate function for setting up event listeners
function setupOverlayEventListeners() {
  // Toggle button functionality
  const toggleButton = document.getElementById('palmspeak-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', function() {
      if (isRecognizing) {
        stopRecognition();
        toggleButton.textContent = 'Start';
        toggleButton.classList.remove('active');
        toggleButton.setAttribute('aria-label', 'Start recognition');
      } else {
        // Tell background script to start capture
        chrome.runtime.sendMessage({ action: "startCapture" });
        toggleButton.textContent = 'Stop';
        toggleButton.classList.add('active');
        toggleButton.setAttribute('aria-label', 'Stop recognition');
      }
    });
  }

  // Clear button functionality
  const clearButton = document.getElementById('palmspeak-clear');
  if (clearButton) {
    clearButton.addEventListener('click', function () {
      console.log("Clear button clicked");
      translatedText = "";
      if (translationElement) {
        translationElement.textContent = "No translation yet";
        console.log("Translation cleared");
      }
      // Also reset the prediction display
      if (predictionElement) {
        predictionElement.textContent = "...";
      }
      // Reset letter tracking
      lastDetectedLetter = null;
      letterConfirmationCount = 0;
      letterHistory = [];
      
      // Provide user feedback
      clearButton.style.backgroundColor = '#4CAF50';
      setTimeout(() => {
        clearButton.style.backgroundColor = '#757575';
      }, 200);
    });
  }

  // Minimize button functionality
  const minimizeButton = document.getElementById('palmspeak-minimize');
  if (minimizeButton) {
    minimizeButton.addEventListener('click', function() {
      toggleOverlayMinimize();
    });
  }

  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Only work if overlay is visible
    if (overlay && overlay.style.display !== 'none') {
      // Ctrl+Shift+M to minimize/restore
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        toggleOverlayMinimize();
      }
      // Ctrl+Shift+C to clear
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (clearButton) clearButton.click();
      }
    }
  });
}

// Enhanced toggle overlay minimize with better state management
function toggleOverlayMinimize() {
  const content = document.getElementById('palmspeak-content');
  const minimizeButton = document.getElementById('palmspeak-minimize');
  const container = overlay.querySelector('.palmspeak-container');
  
  if (!isOverlayMinimized) {
    // Minimize
    content.style.display = 'none';
    minimizeButton.textContent = '+';
    minimizeButton.title = 'Restore overlay';
    container.classList.add('minimized');
    isOverlayMinimized = true;
    
    // Store the minimized state
    chrome.storage.local.set({ overlayMinimized: true });
  } else {
    // Restore
    content.style.display = 'block';
    minimizeButton.textContent = '−';
    minimizeButton.title = 'Minimize overlay';
    container.classList.remove('minimized');
    isOverlayMinimized = false;
    
    // Store the restored state
    chrome.storage.local.set({ overlayMinimized: false });
  }
}

// Enhanced show overlay with state restoration
function showOverlay() {
  if (overlay) {
    overlay.style.display = 'block';
    
    // Restore previous minimize state
    chrome.storage.local.get(['overlayMinimized'], (result) => {
      if (result.overlayMinimized && !isOverlayMinimized) {
        toggleOverlayMinimize();
      } else if (!result.overlayMinimized && isOverlayMinimized) {
        toggleOverlayMinimize();
      }
    });
  }
}

// Hide overlay
function hideOverlay() {
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Set up message listeners for background script communication
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("PalmSpeak content script received message:", message.action);

    if (message.action === "showOverlay") {
      showOverlay();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "hideOverlay") {
      hideOverlay();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "startCapture") {
      // Get the streamId from the background script
      const streamId = message.streamId;
      console.log("Received stream ID:", streamId);

      if (!streamId) {
        console.error("No streamId provided");
        return;
      }

      // Use the streamId to create a video stream
      navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        },
        audio: false
      })
      .then(stream => {
        captureStream = stream;
        startRecognition(stream);
        if (sendResponse) sendResponse({ success: true });
      })
      .catch(error => {
        console.error("Error starting stream from streamId:", error);
        updatePrediction("Error: " + error.message, 0);
        if (sendResponse) sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async
    }

    if (message.action === "stopCapture") {
      stopRecognition();
      if (sendResponse) sendResponse({ success: true });
    }

    return false;
  });
}

// Start recognition process with video stream
function startRecognition(stream) {
  if (isRecognizing) return;

  isRecognizing = true;
  console.log("PalmSpeak: Starting recognition");

  // Update UI
  if (predictionElement) {
    predictionElement.textContent = "Starting recognition...";
  }
  
  // Reset translation state
  letterHistory = [];
  lastDetectedLetter = null;
  letterConfirmationCount = 0;
  
  // Create video element for stream
  videoElement = document.createElement('video');
  videoElement.style.display = 'none'; // Hidden video element
  videoElement.srcObject = stream;
  videoElement.onloadedmetadata = () => {
    videoElement.play();
    beginFrameCapture();
  };
  document.body.appendChild(videoElement);
}

// Begin capturing frames from video
function beginFrameCapture() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 224; // Size for model input
  canvas.height = 224;
  
  captureInterval = setInterval(() => {
    if (!isRecognizing || !videoElement) return;

    try {
      // Draw the current video frame onto the canvas
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const imageDataURL = canvas.toDataURL('image/jpeg', 0.8); // Optimize JPEG quality
      
      // Send the frame to the Flask API
      fetch('http://127.0.0.1:5000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageDataURL })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          console.error("PalmSpeak: API Error:", data.error);
          return;
        }
        
        // Only process if we're still recognizing (might have stopped during fetch)
        if (isRecognizing) {
          updatePrediction(data.letter, data.confidence);
        }
      })
      .catch(error => {
        console.error("PalmSpeak: Error sending frame to API:", error);
        if (isRecognizing && predictionElement) {
          predictionElement.textContent = "API Error: " + error.message;
        }
      });
    } catch (error) {
      console.error("Error during frame processing:", error);
    }
  }, FRAME_INTERVAL);
}

// Stop recognition process
function stopRecognition() {
  if (!isRecognizing) return;

  isRecognizing = false;
  console.log("PalmSpeak: Stopping recognition");

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
  }
  
  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.remove();
    videoElement = null;
  }

  if (predictionElement) {
    predictionElement.textContent = "Recognition stopped";
  }
  
  // Reset state
  lastDetectedLetter = null;
  letterConfirmationCount = 0;
  
  // Update button state if needed
  const toggleButton = document.getElementById('palmspeak-toggle');
  if (toggleButton) {
    toggleButton.textContent = 'Start';
    toggleButton.classList.remove('active');
  }
}

// Update the prediction and translation
function updatePrediction(letter, confidence) {
  if (!predictionElement) {
    predictionElement = document.getElementById('palmspeak-prediction');
  }
  if (!translationElement) {
    translationElement = document.getElementById('palmspeak-translation-text');
  }

  if (predictionElement) {
    predictionElement.textContent = `Prediction: ${letter} (${(confidence * 100).toFixed(1)}%)`;
    
    // Add visual feedback for new detection
    predictionElement.classList.add('flash');
    setTimeout(() => {
      predictionElement.classList.remove('flash');
    }, 300);
  }

  // Only process if confidence is high enough to avoid noise
  if (confidence >= 0.6) {
    // Check if this is the same letter as before
    if (letter === lastDetectedLetter) {
      letterConfirmationCount++;
    } else {
      // New letter detected, reset confirmation count
      letterConfirmationCount = 1;
      lastDetectedLetter = letter;
    }
    
    // Only add to translation if we've confirmed this letter enough times
    // and it's different from the last letter we added to translation
    if (letterConfirmationCount >= CONFIRMATION_THRESHOLD) {
      // Only add if it's not 'nothing' and we haven't already added this letter
      if (letter !== 'nothing') {
        if (letter === 'space') {
          translatedText += " ";
          // Reset so we can add more spaces if needed
          letterConfirmationCount = 0;
          lastDetectedLetter = null;
        } else if (letter === 'del') {
          translatedText = translatedText.slice(0, -1);
          // Reset so we can delete more characters if needed
          letterConfirmationCount = 0;
          lastDetectedLetter = null;
        } else {
          // Regular letter - only add if it's different from the last character
          const lastChar = translatedText.slice(-1);
          if (lastChar !== letter) {
            translatedText += letter;
            console.log(`Added letter: ${letter} to translation: ${translatedText}`);
          }
        }
        
        if (translationElement) {
          translationElement.textContent = translatedText || "No translation yet";
        }
      }
    }
  } else {
    // Low confidence, reset tracking
    letterConfirmationCount = 0;
    lastDetectedLetter = null;
  }
}

// Initialize on load
initialize();