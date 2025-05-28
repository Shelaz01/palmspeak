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
  // Remove existing overlay if it exists
  const existingOverlay = document.getElementById('palmspeak-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  overlay = document.createElement('div');
  overlay.id = 'palmspeak-overlay';
  overlay.innerHTML = `
    <div class="palmspeak-container">
      <div class="palmspeak-header">
        <h3>PalmSpeak ASL Translator</h3>
        <button id="palmspeak-toggle" class="palmspeak-button">Start</button>
      </div>
      <div class="palmspeak-content">
        <div id="palmspeak-prediction" class="palmspeak-prediction">...</div>
        <div class="palmspeak-text-display">
            <div class="palmspeak-label">Translation:</div>
            <div id="palmspeak-translation-text" class="palmspeak-text">No translation yet</div>
         </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // Store references to elements
  predictionElement = document.getElementById('palmspeak-prediction');
  translationElement = document.getElementById('palmspeak-translation-text');
  
  // Add toggle button functionality
  const toggleButton = document.getElementById('palmspeak-toggle');
  if (toggleButton) {
    toggleButton.addEventListener('click', function() {
      if (isRecognizing) {
        stopRecognition();
        toggleButton.textContent = 'Start';
        toggleButton.classList.remove('active');
      } else {
        // Tell background script to start capture
        chrome.runtime.sendMessage({ action: "startCapture" });
        toggleButton.textContent = 'Stop';
        toggleButton.classList.add('active');
      }
    });
  }
}

// Set up message listeners for background script communication
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("PalmSpeak content script received message:", message.action);

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

  // Update letter history
  letterHistory.push(letter);
  if (letterHistory.length > MAX_HISTORY) {
    letterHistory.shift();
  }

  // Basic translation logic with smoothing
  if (letterHistory.length === MAX_HISTORY) {
    const mostFrequentLetter = findMostFrequent(letterHistory);
    
    // Only process if confidence is high enough to avoid noise
    if (confidence >= 0.6) {
      if (mostFrequentLetter !== 'nothing') {
        if (mostFrequentLetter === 'space') {
          translatedText += " ";
        } else if (mostFrequentLetter === 'del') {
          translatedText = translatedText.slice(0, -1);
        } else {
          translatedText += mostFrequentLetter;
        }
        
        if (translationElement) {
          translationElement.textContent = translatedText || "No translation yet";
        }
      }
    }
  }
}

// Helper function to find most frequent letter in history
function findMostFrequent(arr) {
  const frequencyMap = {};
  let maxFrequency = 0;
  let mostFrequentItem = '';

  for (const item of arr) {
    frequencyMap[item] = (frequencyMap[item] || 0) + 1;
    if (frequencyMap[item] > maxFrequency) {
      maxFrequency = frequencyMap[item];
      mostFrequentItem = item;
    }
  }
  
  // Only return if it appears at least twice to reduce false positives
  return maxFrequency >= 2 ? mostFrequentItem : 'nothing';
}

// Initialize on load
initialize();