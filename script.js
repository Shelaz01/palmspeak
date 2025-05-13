// Extension popup script
const turnOnSwitch = document.getElementById("turn-on");
const aslSwitch = document.getElementById("asl-switch");
const zslSwitch = document.getElementById("zsl-switch");
const statusText = document.getElementById("status-text");
const captureButton = document.getElementById("capture-button");
const translationText = document.getElementById("translation-text");
const apiStatus = document.getElementById("api-status");
let isCapturing = false;

// Initialize state from storage
chrome.storage.local.get(['isOn', 'aslEnabled', 'zslEnabled', 'isCapturing'], (result) => {
    turnOnSwitch.checked = result.isOn || false;
    aslSwitch.checked = result.aslEnabled || false;
    zslSwitch.checked = result.zslEnabled || false;
    isCapturing = result.isCapturing || false;
    
    // Update UI based on stored state
    aslSwitch.disabled = !turnOnSwitch.checked;
    zslSwitch.disabled = !turnOnSwitch.checked;
    updateCaptureButtonState();
});

turnOnSwitch.addEventListener("change", function () {
    const isOn = turnOnSwitch.checked;
    aslSwitch.disabled = !isOn;
    zslSwitch.disabled = !isOn;
    
    // Store state
    chrome.storage.local.set({isOn: isOn});
    
    // If turning off, also stop any capture
    if (!isOn && isCapturing) {
        toggleCapture();
    }
});

aslSwitch.addEventListener("change", function() {
    chrome.storage.local.set({aslEnabled: aslSwitch.checked});
});

zslSwitch.addEventListener("change", function() {
    chrome.storage.local.set({zslEnabled: zslSwitch.checked});
});

captureButton.addEventListener("click", toggleCapture);

function toggleCapture() {
    // Before toggling, check API health if trying to start
    if (!isCapturing) {
        checkApiHealth()
            .then(isHealthy => {
                if (isHealthy) {
                    proceedWithToggle();
                } else {
                    statusText.textContent = "Error: Flask API not available";
                    statusText.classList.add("error");
                }
            })
            .catch(error => {
                statusText.textContent = "Error: " + error.message;
                statusText.classList.add("error");
            });
    } else {
        // If stopping, just proceed
        proceedWithToggle();
    }
}

function checkApiHealth() {
    apiStatus.textContent = "Checking...";
    apiStatus.classList.remove("success", "error");
    
    return fetch('http://127.0.0.1:5000/health')
        .then(response => {
            if (!response.ok) {
                throw new Error(`API health check failed with status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const isHealthy = data.status === 'healthy' && data.model_loaded;
            
            if (isHealthy) {
                apiStatus.textContent = "Available";
                apiStatus.classList.add("success");
            } else {
                apiStatus.textContent = data.model_loaded ? "API Error" : "Model Not Loaded";
                apiStatus.classList.add("error");
            }
            
            return isHealthy;
        })
        .catch(error => {
            console.error("API Health Check Failed:", error);
            apiStatus.textContent = "Unavailable";
            apiStatus.classList.add("error");
            return false;
        });
}

function proceedWithToggle() {
    // Flip the state
    isCapturing = !isCapturing;
    
    // Update UI immediately for responsiveness
    updateCaptureButtonState();
    
    // Show "processing" message
    statusText.textContent = isCapturing ? "Starting capture..." : "Stopping capture...";
    statusText.classList.remove("error", "success");
    
    // Send message to background script
    chrome.runtime.sendMessage(
        {action: "toggleCapture", status: isCapturing}, 
        function(response) {
            // Check for communication errors
            if (chrome.runtime.lastError) {
                console.error("Error:", chrome.runtime.lastError.message);
                statusText.textContent = "Error: " + chrome.runtime.lastError.message;
                statusText.classList.add("error");
                // Revert the toggle since it failed
                isCapturing = !isCapturing;
                updateCaptureButtonState();
                return;
            }
            
            // Handle the response from the background script
            if (response) {
                console.log("Background script response:", response);
                
                if (response.error) {
                    // Something went wrong, revert the toggle
                    isCapturing = !isCapturing;
                    updateCaptureButtonState();
                    statusText.textContent = response.status || "An error occurred";
                    statusText.classList.add("error");
                } else {
                    // Update status with the response
                    statusText.textContent = response.status;
                    if (isCapturing) {
                        statusText.classList.add("success");
                    }
                    
                    // Store the updated state
                    chrome.storage.local.set({isCapturing: isCapturing});
                }
            } else {
                // No response is also an error
                statusText.textContent = "No response from background script";
                statusText.classList.add("error");
                isCapturing = !isCapturing;
                updateCaptureButtonState();
            }
        }
    );
}

function updateCaptureButtonState() {
    captureButton.textContent = isCapturing ? "Stop Capture" : "Start Capture";
    captureButton.classList.toggle("capturing", isCapturing);
    
    if (!statusText.textContent || statusText.textContent === "Ready") {
        statusText.textContent = isCapturing ? "Capturing frames..." : "Ready";
        statusText.classList.remove("error", "success", "warning");
        if (isCapturing) {
            statusText.classList.add("success");
        }
    }
}

// Check if we're on a Teams or Zoom page when popup opens
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
        const isValidPage = tabs[0].url && 
            (tabs[0].url.includes("teams.live.com") || 
             tabs[0].url.includes("teams.microsoft.com") || 
             tabs[0].url.includes("zoom.us"));
        
        if (!isValidPage) {
            statusText.textContent = "Please navigate to Microsoft Teams or Zoom";
            statusText.classList.add("warning");
            captureButton.disabled = true;
        } else {
            // Check API health when opened on valid page
            checkApiHealth()
                .then(isHealthy => {
                    if (!isHealthy) {
                        statusText.textContent = "Flask API not available";
                        statusText.classList.add("error");
                        captureButton.disabled = true;
                    } else {
                        statusText.textContent = "Ready";
                        captureButton.disabled = false;
                    }
                })
                .catch(() => {
                    statusText.textContent = "Cannot connect to Flask API";
                    statusText.classList.add("error");
                    captureButton.disabled = true;
                });
        }
    }
});