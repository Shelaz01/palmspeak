const turnOnSwitch = document.getElementById("turn-on");
const aslSwitch = document.getElementById("asl-switch");
const zslSwitch = document.getElementById("zsl-switch");
const statusText = document.getElementById("status-text");
const captureButton = document.getElementById("capture-button");
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
    // Flip the state
    isCapturing = !isCapturing;
    
    // Update UI immediately for responsiveness
    updateCaptureButtonState();
    
    // Show "processing" message
    statusText.textContent = isCapturing ? "Starting capture..." : "Stopping capture...";
    
    // Send message to background script
    chrome.runtime.sendMessage(
        {action: "toggleCapture", status: isCapturing}, 
        function(response) {
            // Check for communication errors
            if (chrome.runtime.lastError) {
                console.error("Error:", chrome.runtime.lastError.message);
                statusText.textContent = "Error: " + chrome.runtime.lastError.message;
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
                } else {
                    // Update status with the response
                    statusText.textContent = response.status;
                    if (!isCapturing && response.frameCount) {
                        statusText.textContent += ` (${response.frameCount} frames captured)`;
                    }
                    
                    // Store the updated state
                    chrome.storage.local.set({isCapturing: isCapturing});
                }
            } else {
                // No response is also an error
                statusText.textContent = "No response from background script";
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
    }
}

// Check if we're on a Teams page when popup opens
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
        const isTeamsPage = tabs[0].url && 
            (tabs[0].url.includes("teams.live.com") || tabs[0].url.includes("teams.microsoft.com"));
        
        if (!isTeamsPage) {
            statusText.textContent = "Please navigate to Microsoft Teams";
            captureButton.disabled = true;
        } else {
            statusText.textContent = "Ready";
            captureButton.disabled = false;
        }
    }
});