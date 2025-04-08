// Add to the top of your content.js file
let aslModel = null;
let isModelLoaded = false;
let lastPredictions = [];
let predictionHistory = [];
const CONFIDENCE_THRESHOLD = 0.7; // Minimum confidence to accept a prediction
const HISTORY_SIZE = 5; // Number of predictions to maintain for smoothing

// Function to load the ASL TensorFlow.js model
async function loadASLModel() {
    try {
        console.log("PalmSpeak: Loading ASL model...");
        // Load the model from the extension's directory
        aslModel = await tf.loadLayersModel(chrome.runtime.getURL('asl_alphabet_tfjs/model.json'));
        console.log("PalmSpeak: ASL model loaded successfully");
        isModelLoaded = true;
        return true;
    } catch (error) {
        console.error("PalmSpeak: Failed to load ASL model:", error);
        return false;
    }
}

// Process a frame with the ASL model
async function processFrameWithASLModel(imageData) {
    if (!isModelLoaded || !aslModel) {
        console.warn("PalmSpeak: Model not loaded yet");
        return null;
    }
    
    try {
        // Create an image element from the data URL
        const img = new Image();
        img.src = imageData;
        
        await new Promise(resolve => {
            img.onload = resolve;
        });
        
        // Create a canvas for preprocessing
        const canvas = document.createElement('canvas');
        // Most models expect specific dimensions - adjust these to match your model
        canvas.width = 224;  // Typical model input size
        canvas.height = 224; // Typical model input size
        const ctx = canvas.getContext('2d');
        
        // Draw and resize the image to the expected dimensions
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Get the image data
        const imageDataResized = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Preprocess the image data to match your model's expected input
        // This may vary based on how your model was trained
        const tensor = tf.browser.fromPixels(imageDataResized)
            .toFloat()
            .div(255.0)  // Normalize to [0,1]
            .expandDims(0); // Add batch dimension
        
        // Make prediction
        const predictions = await aslModel.predict(tensor).data();
        
        // Get the class names (alphabet letters)
        const classNames = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        
        // Convert to array of {letter, probability}
        const results = Array.from(predictions).map((prob, i) => ({
            letter: classNames[i],
            probability: prob
        }));
        
        // Sort by probability (highest first)
        results.sort((a, b) => b.probability - a.probability);
        
        // Store the top prediction
        const topPrediction = results[0];
        
        // Only consider predictions above threshold
        if (topPrediction.probability >= CONFIDENCE_THRESHOLD) {
            // Add to history
            predictionHistory.push(topPrediction.letter);
            if (predictionHistory.length > HISTORY_SIZE) {
                predictionHistory.shift();
            }
            
            // Simple smoothing - use most common letter in recent history
            const counts = {};
            let maxLetter = null;
            let maxCount = 0;
            
            for (const letter of predictionHistory) {
                counts[letter] = (counts[letter] || 0) + 1;
                if (counts[letter] > maxCount) {
                    maxCount = counts[letter];
                    maxLetter = letter;
                }
            }
            
            lastPredictions = results;
            return maxLetter;
        }
        
        lastPredictions = results;
        return null;
        
    } catch (error) {
        console.error("PalmSpeak: Error processing frame:", error);
        return null;
    }
}

// Flag to track if the script has announced itself as ready
let hasAnnouncedReady = false;

// Function to recursively search for video elements in shadow roots
function findVideoInShadowRoot(root) {
    let videos = [];
    if (!root) return videos;

    const children = root.querySelectorAll("*");
    for (const child of children) {
        if (child.tagName.toLowerCase() === "video") {
            videos.push(child);
        } else if (child.shadowRoot) {
            videos = videos.concat(findVideoInShadowRoot(child.shadowRoot));
        }
    }
    return videos;
}

// Storage for captured frames
let capturedFrames = [];
let isCapturing = false;
let captureInterval;
let activeVideoElement = null;
const FRAME_RATE = 10; // 10 frames per second

// Main function to detect video elements dynamically
function detectVideoElements() {
    console.log("PalmSpeak: Searching for video elements...");
    
    const observer = new MutationObserver((mutations) => {
        const videoElements = findVideoInShadowRoot(document);
        if (videoElements.length > 0) {
            console.log("PalmSpeak: Video elements detected:", videoElements);
            
            // Store the first video element for later use
            activeVideoElement = videoElements[0];
            
            // Mark ourselves as fully ready since we found a video
            if (!hasAnnouncedReady) {
                announceContentScriptReady();
            }
            
            // Just disconnect the observer once we found the video
            observer.disconnect();
        }
    });

    observer.observe(document, { childList: true, subtree: true });
    
    // Also check immediately in case videos already exist
    const videoElements = findVideoInShadowRoot(document);
    if (videoElements.length > 0) {
        console.log("PalmSpeak: Video elements found immediately:", videoElements);
        activeVideoElement = videoElements[0];
        
        // Mark ourselves as fully ready
        if (!hasAnnouncedReady) {
            announceContentScriptReady();
        }
        
        observer.disconnect();
    }
}

// Function to announce that the content script is loaded and ready
function announceContentScriptReady() {
    if (hasAnnouncedReady) return;
    
    hasAnnouncedReady = true;
    console.log("PalmSpeak: Content script announcing itself as ready");
    
    try {
        chrome.runtime.sendMessage({
            action: "contentScriptReady",
            url: window.location.href
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error announcing ready:", chrome.runtime.lastError.message);
                // If we can't announce, try again in a moment
                setTimeout(announceContentScriptReady, 1000);
                hasAnnouncedReady = false;
            } else {
                console.log("PalmSpeak: Background script acknowledged:", response);
            }
        });
    } catch (e) {
        console.error("Exception announcing ready:", e);
        // If we encounter an exception, try again in a moment
        setTimeout(announceContentScriptReady, 1000);
        hasAnnouncedReady = false;
    }
}

// Function to start continuous frame capture
function startContinuousCapture() {
    if (isCapturing) return;
    
    // Make sure the model is loaded
    if (!isModelLoaded) {
        loadASLModel().then(success => {
            if (success) {
                console.log("PalmSpeak: Model loaded, ready for predictions");
            } else {
                console.error("PalmSpeak: Failed to load model, continuing without ASL recognition");
            }
        });
    }
    if (isCapturing) return;
    
    // Find video element if we don't have one yet
    if (!activeVideoElement) {
        const videoElements = findVideoInShadowRoot(document);
        if (videoElements.length > 0) {
            activeVideoElement = videoElements[0];
        } else {
            console.error("PalmSpeak: No video element found to capture");
            return false;
        }
    }
    
    isCapturing = true;
    capturedFrames = []; // Reset frames array
    
    console.log("PalmSpeak: Starting continuous frame capture at " + FRAME_RATE + " fps");
    
    // Create a capture interval at specified frame rate
    captureInterval = setInterval(() => {
        captureFrame(activeVideoElement);
    }, 1000 / FRAME_RATE);
    
    return true;
}

// Function to capture a single frame from the video element
function captureFrame(videoElement) {
    if (!videoElement || videoElement.paused || videoElement.ended) {
        return;
    }
    
    try {
        const canvas = document.createElement("canvas");
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const context = canvas.getContext("2d");
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL("image/png");
        
        // Store the frame
        const frameInfo = {
            data: imageData,
            timestamp: new Date().toISOString()
        };
        
        // Process with ASL model if enabled
        chrome.storage.local.get(['aslEnabled'], async (result) => {
            if (result.aslEnabled) {
                const letter = await processFrameWithASLModel(imageData);
                if (letter) {
                    frameInfo.aslLetter = letter;
                    console.log("PalmSpeak: ASL letter detected:", letter);
                    
                    // Here you could send the letter to your UI or accumulate into words
                    // For example, create a floating overlay on the page
                    displayDetectedLetter(letter);
                }
            }
            
            capturedFrames.push(frameInfo);
            console.log("PalmSpeak: Frame captured, total frames:", capturedFrames.length);
        });
    } catch (e) {
        console.error("Error capturing frame:", e);
    }
}


// Function to display detected letters in an overlay
function displayDetectedLetter(letter) {
    // Check if overlay exists, create it if not
    let overlay = document.getElementById('palmspeak-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'palmspeak-overlay';
        overlay.style.position = 'fixed';
        overlay.style.bottom = '20px';
        overlay.style.left = '20px';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        overlay.style.color = 'white';
        overlay.style.padding = '10px 20px';
        overlay.style.borderRadius = '5px';
        overlay.style.zIndex = '9999';
        overlay.style.fontSize = '24px';
        overlay.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(overlay);
        
        // Also create a text accumulation area
        const textArea = document.createElement('div');
        textArea.id = 'palmspeak-text';
        textArea.style.marginTop = '10px';
        textArea.style.fontSize = '16px';
        overlay.appendChild(textArea);
    }
    
    // Update letter display
    overlay.firstChild.textContent = `Detected: ${letter}`;
    
    // Accumulate letters into words
    const textArea = document.getElementById('palmspeak-text');
    if (!textArea.textContent) {
        textArea.textContent = letter;
    } else {
        // Simple space handling - if we detect the same letter repeatedly,
        // we won't add it multiple times
        const lastChar = textArea.textContent.charAt(textArea.textContent.length - 1);
        if (lastChar !== letter) {
            // Special handling for specific gestures could go here
            // For example, a particular sign might indicate space or backspace
            textArea.textContent += letter;
        }
    }
}

// Function to stop capture and prepare download
function stopCapture() {
    if (!isCapturing) return 0;
    
    clearInterval(captureInterval);
    isCapturing = false;
    console.log(`PalmSpeak: Capture stopped. ${capturedFrames.length} frames captured.`);
    
    // Prepare download of all captured frames
    if (capturedFrames.length > 0) {
        prepareFramesDownload();
        return capturedFrames.length;
    }
    
    return 0;
}

// Function to prepare frames for download
function prepareFramesDownload() {
    // Create a zip file containing all frames
    // For this example, we'll use a simple JSON blob
    
    const framesData = {
        sessionInfo: {
            frameCount: capturedFrames.length,
            captureDate: new Date().toISOString(),
            frameRate: FRAME_RATE
        },
        frames: capturedFrames
    };
    
    // Create a JSON blob
    const jsonBlob = new Blob([JSON.stringify(framesData)], { type: 'application/json' });
    const url = URL.createObjectURL(jsonBlob);
    
    // Trigger download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(url, `palmspeak_session_${timestamp}.json`);
    
    // Clear memory
    capturedFrames = [];
}

// Function to download a file from a blob URL
function downloadFile(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("PalmSpeak: Content script received message:", message);
    
    try {
        if (message.action === "startCapture") {
            const success = startContinuousCapture();
            sendResponse({
                status: success ? "Capture started" : "Failed to start capture", 
                success: success
            });
        } else if (message.action === "stopCapture") {
            const frameCount = stopCapture();
            sendResponse({
                status: "Capture stopped", 
                frameCount: frameCount,
                success: true
            });
        }
    } catch (e) {
        console.error("PalmSpeak: Error handling message:", e);
        sendResponse({status: "Error: " + e.message, error: true});
    }
    
    return true; // Keep the message channel open for async response
});

// Announce that the content script is loaded
console.log("PalmSpeak: Content script loaded");

// First, announce we're basically ready
setTimeout(announceContentScriptReady, 500);

// Then start looking for video elements
window.addEventListener("load", () => {
    console.log("PalmSpeak: Page loaded, starting video detection");
    detectVideoElements();
});

// Also detect videos if the script is injected after page load
if (document.readyState === "complete") {
    console.log("PalmSpeak: Page already loaded, starting video detection");
    detectVideoElements();
}