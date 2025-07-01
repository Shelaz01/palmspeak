# PalmSpeak: Real-Time Sign Language Translation

[![University of Zimbabwe](https://img.shields.io/badge/University-of%20Zimbabwe-blue.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-orange.svg)]()
[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)]()

> **Real-time Sign Language Translation for Enhanced Video Communication**

PalmSpeak is a browser extension that provides real-time translation of Zimbabwean Sign Language (ZimSL) alphabet into readable text during video calls on platforms like Zoom, Microsoft Teams, and Google Meet.

##  Overview

PalmSpeak bridges communication gaps between deaf and hearing individuals in digital environments by leveraging AI-driven gesture recognition and accessible browser technologies. The system captures video input, recognizes sign language gestures using machine learning, and displays translations as an overlay during video calls.

### Key Features

-  **Real-Time Gesture Recognition** - Uses MediaPipe for hand landmark detection with TensorFlow-trained models
-  **Browser Extension Integration** - Seamless overlay on popular video conferencing platforms
-  **Translation Overlay** - Live display of recognized letters and assembled text
-  **API Control Center** - Tkinter GUI for managing the Flask server and monitoring model status
-  **Prediction Buffering** - Smoothing algorithms to reduce flickering and improve stability
-  **Privacy-First** - All processing happens locally, no data leaves your machine

##  Quick Start

### Prerequisites

- Windows 10/11
- Chrome Browser (v100+)
- Webcam (integrated or USB)
- Python 3.8+ (for development)

### Installation

#### 1. Chrome Extension Setup

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right corner)
4. Click **Load unpacked** and select the extension folder
5. Pin the PalmSpeak icon to your toolbar

#### 2. Control Center Setup

1. Download and run `PalmSpeak_Control_Centre.exe`
2. Wait for the AI model to load (indicated in System Status)
3. Click ** Turn On API** to start the server

### Usage

1. **Start the Control Center**
   - Launch the `.exe` application
   - Ensure "AI Model: ● Loaded" and "API Server: ● Running" are green

2. **Join a Video Call**
   - Open Google Meet, Zoom, or Microsoft Teams
   - Ensure your webcam is active

3. **Activate PalmSpeak**
   - Click the PalmSpeak extension icon
   - Select **Start Recognition**
   - Choose screen capture permissions
   - Click **Show Overlay** to display translations

4. **Start Signing**
   - Sign letters from the ZimSL alphabet
   - Watch real-time translations appear in the overlay
   - Use **Clear** to reset or **Stop Recognition** to pause

##  Architecture

```
┌─────────────────┐    HTTP/JSON    ┌──────────────────┐    TensorFlow    ┌─────────────────┐
│                 │ ──────────────► │                  │ ───────────────► │                 │
│ Chrome Extension│                 │   Flask API      │                  │ ASL Recognition │
│     (Overlay)   │ ◄────────────── │ (Control Center) │ ◄─────────────── │     Model       │
└─────────────────┘    Predictions   └──────────────────┘    Classifications└─────────────────┘
```

### Components

- **Chrome Extension**: Captures webcam frames and displays predictions
- **Flask API**: Processes images using MediaPipe and serves ML model
- **ASL Recognition Model**: TensorFlow/Keras model trained on ZimSL alphabet
- **Control Center**: Tkinter GUI for system management

## 🛠️ Technical Details

### Dependencies

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend** | Flask, TensorFlow/Keras | API server and ML model |
| **Computer Vision** | MediaPipe, OpenCV | Hand landmark detection |
| **Frontend** | JavaScript, HTML, CSS | Browser extension UI |
| **Desktop GUI** | Tkinter | Control center interface |
| **Packaging** | cx_Freeze | Executable distribution |

### Supported Platforms

- ✅ Google Meet
- ✅ Microsoft Teams  


##  Requirements

### Functional Requirements

- **Real-Time Video Capture**: Capture frames at ≤2 fps for processing
- **Gesture Recognition**: Extract MediaPipe landmarks and classify letters
- **Translation Assembly**: Buffer predictions and assemble running text
- **Overlay Display**: Toggle-able, draggable, minimizable interface
- **API Health Monitoring**: Status endpoints for system health checks

### Performance Targets

| Metric | Target | Hardware |
|--------|--------|----------|
| **Latency** | ≤200ms end-to-end | Intel i5, 8GB RAM |
| **Accuracy** | ≥90% top-1 accuracy | 29-class alphabet |
| **Privacy** | 100% local processing | No external requests |

##  Testing

### Test Coverage

-  **Integration Testing**: Extension ↔ API communication
-  **System Testing**: End-to-end workflow validation  
-  **Performance Testing**: Latency and responsiveness metrics
-  **Edge Case Testing**: Poor lighting, occlusions, no hand detection
-  **User Acceptance Testing**: Feedback from target users

### Known Issues

| Issue | Status | Resolution |
|-------|--------|------------|
| API model loading in some builds | Resolved | Absolute path handling |
| Flask thread shutdown | Known Limit | Handled during exit |

##  Usage Examples

### Keyboard Shortcuts

- `Ctrl + Shift + M` - Minimize/restore overlay
- `Ctrl + Shift + C` - Clear translation

### API Endpoints

```bash
# Health check
GET http://127.0.0.1:5000/health

# Prediction
POST http://127.0.0.1:5000/predict
Content-Type: application/json
{
  "image": "data:image/jpeg;base64,..."
}

# Clear buffer
POST http://127.0.0.1:5000/clear-buffer
```

##  Development

### Local Development Setup

```bash
# Clone repository
git clone <https://github.com/Shelaz01/palmspeak>
cd palmspeak

# Install dependencies
pip install -r requirements.txt

# Run Flask API
python palmspeak_control_centre.py

# Load extension in Chrome
# Navigate to chrome://extensions/ and load unpacked
```

### Building Executable

```bash
# Install cx_Freeze
pip install cx_Freeze

# Build executable
python build_exe.py build

# Find executable in dist/ folder
```

##  Future Roadmap

-  **Full Phrase Recognition**: Extend beyond alphabet to complete sentences
-  **Multi-Language Support**: Add SASL and other regional sign languages  
-  **Mobile App**: Android version using TensorFlow Lite
-  **Auto-Updates**: Chrome Web Store distribution
-  **UI Improvements**: Enhanced overlay design and customization

##  Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

##  License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

##  Team

- **Shelton S. Lino** (R216890G) - Lead Developer
- **Ms. Jowa** - Project Supervisor
- **University of Zimbabwe** - Faculty of Computer Engineering, Informatics and Communications

##  Acknowledgments

- University of Zimbabwe Department of Computer Science
- ASL dataset contributors
- MediaPipe and TensorFlow teams for excellent ML tools

##  Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review existing [GitHub Issues](../../issues)

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Model not loading | Ensure `asl_alphabet_model.h5` is in correct path |
| API not starting | Wait for model load, check port 5000 availability |
| Nothing detected | Ensure good lighting and hand visibility |
| Extension not responding | Reload extension, confirm Control Center is running |

---

**Made for digital inclusivity**