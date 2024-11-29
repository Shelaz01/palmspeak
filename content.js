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

// Main function to detect video elements dynamically
function detectVideoElements() {
    const observer = new MutationObserver((mutations) => {
        const videoElements = findVideoInShadowRoot(document);
        if (videoElements.length > 0) {
            console.log("Video elements detected:", videoElements);

            // Disconnect the observer once a video element is found
            observer.disconnect();

            // Add a delay to ensure the video feed is loaded before capturing
            setTimeout(() => {
                captureScreenshot(videoElements[0]); // Capture from the first video element
            }, 2000); // 2-second delay
        }
    });

    observer.observe(document, { childList: true, subtree: true });
}

// Function to capture a screenshot from a video element
function captureScreenshot(videoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/png");
    downloadImage(imageData, "teams_screenshot.png");
    console.log("Screenshot captured and download triggered.");
}

// Function to download the captured screenshot
function downloadImage(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start the video detection process
window.addEventListener("load", () => {
    console.log("PalmSpeak: Running Teams video detection script...");
    detectVideoElements();
});
