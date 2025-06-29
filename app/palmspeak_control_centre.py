#!/usr/bin/env python3
#!/usr/bin/env python3
# ---- stdout/stderr patch for frozen --windowed builds ------------------------
import sys, io

class _NullIO(io.TextIOBase):
    """A write‑once sink that discards all text (fixes stdout/stderr=None)."""
    def write(self, *_):  pass
    def flush(self):      pass

# In PyInstaller --windowed or cx_Freeze Win32GUI builds, pythonw.exe starts
# the app with no console, so sys.stdout/sys.stderr are set to None.
if sys.stdout is None:
    sys.stdout = _NullIO()
if sys.stderr is None:
    sys.stderr = _NullIO()
# ------------------------------------------------------------------------------

"""
PalmSpeak Control Centre - Tkinter GUI for ASL Recognition API
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import queue
import logging
import sys
import os
from flask import Flask, request, jsonify
import numpy as np
from tensorflow.keras.models import load_model as tf_load_model
from PIL import Image
import io
import base64
from flask_cors import CORS
import traceback
import cv2
import mediapipe as mp
from collections import deque, Counter
import socket
from contextlib import closing

class PalmSpeakControlCentre:
    def __init__(self, root):
        self.root = root
        self.root.title("PalmSpeak Control Centre")
        self.root.geometry("600x500")
        self.root.resizable(True, True)
        
        # Set window colors
        self.root.configure(bg='#E8F4F8')  # Light blue background
        
        # Try to load and set icon
        try:
            icon_path = self.resource_path('images/icon128.png')
            if os.path.exists(icon_path):
                icon = tk.PhotoImage(file=icon_path)
                self.root.iconphoto(True, icon)
        except Exception as e:
            pass  # If icon loading fails, continue without it
        
        # Configure modern style
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure custom styles
        self.configure_styles(style)
        
        # API Server variables
        self.flask_app = None
        self.server_thread = None
        self.server_running = False
        self.port = int(os.environ.get('PORT', 5000))
        
        # Model variables
        self.model = None
        self.model_loaded = False
        self.ASL_CLASSES = [
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
            'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
            'del', 'nothing', 'space'
        ]
        self.prediction_buffer = deque(maxlen=10)
        self.CONFIDENCE_THRESHOLD = 0.3
        
        # Initialize MediaPipe
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(static_image_mode=True, max_num_hands=1)
        
        # Logging setup
        self.log_queue = queue.Queue()
        self.setup_logging()
        
        # Create GUI
        self.create_widgets()
        
        # Start log processing
        self.process_log_queue()
        
        # Try to load model on startup
        self.load_model_async()
    
    def configure_styles(self, style):
        """Configure custom styles for modern look"""
        # Configure frame styles
        style.configure('Modern.TFrame', 
                       background='#E8F4F8',  # Light blue
                       relief='flat')
        
        style.configure('Card.TLabelframe', 
                       background='white',
                       relief='solid',  # Changed to solid for visible border
                       borderwidth=1,   # Made border thinner but visible
                       lightcolor='#B8D4E3',
                       darkcolor='#B8D4E3')
        
        style.configure('Card.TLabelframe.Label',
                       background='white',
                       foreground='#2C3E50',  # Dark blue-gray
                       font=('Segoe UI', 10, 'bold'))
        
        # Configure label styles
        style.configure('Title.TLabel',
                       background='#E8F4F8',
                       foreground='#1B4F72',  # Dark blue
                       font=('Segoe UI', 18, 'bold'))
        
        style.configure('Status.TLabel',
                       background='white',
                       foreground='#34495E',  # Dark gray
                       font=('Segoe UI', 9, 'bold'))
        
        # Configure button styles with rounded corners
        style.configure('Start.TButton',
                       background='#3498DB',  # Blue
                       foreground='white',
                       font=('Segoe UI', 10, 'bold'),
                       borderwidth=0,
                       focuscolor='none',
                       relief='flat',
                       padding=(20, 10))
        
        style.map('Start.TButton',
                 background=[('active', '#2980B9'),  # Darker blue on hover
                           ('pressed', '#1F618D')])  # Even darker when pressed
        
        style.configure('Stop.TButton',
                       background='#E74C3C',  # Bright red
                       foreground='white',
                       font=('Segoe UI', 10, 'bold'),
                       borderwidth=0,
                       focuscolor='none',
                       relief='flat',
                       padding=(20, 10))
        
        style.map('Stop.TButton',
                 background=[('active', '#C0392B'),  # Darker red on hover
                           ('pressed', '#A93226')])  # Even darker when pressed
        
        # Configure text widget style
        style.configure('Log.TLabelframe',
                       background='white',
                       relief='solid',  # Changed to solid for visible border
                       borderwidth=1,   # Made border thinner but visible
                       lightcolor='#B8D4E3',
                       darkcolor='#B8D4E3')
        
        style.configure('Log.TLabelframe.Label',
                       background='white',
                       foreground='#2C3E50',
                       font=('Segoe UI', 10, 'bold'))
    
    def setup_logging(self):
        """Setup logging to capture messages in GUI"""
        self.logger = logging.getLogger('palmspeak-control')
        self.logger.setLevel(logging.INFO)
        
        # Create handler that puts messages in queue
        handler = QueueHandler(self.log_queue)
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
    
    def create_widgets(self):
        """Create the GUI widgets"""
        # Main frame
        main_frame = ttk.Frame(self.root, padding="20", style='Modern.TFrame')
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(2, weight=1)
        
        # Title
        title_label = ttk.Label(main_frame, text="PalmSpeak Control Centre", 
                               style='Title.TLabel')
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 25))
        
        # Status frame
        status_frame = ttk.LabelFrame(main_frame, text="System Status", 
                                     padding="15", style='Card.TLabelframe')
        status_frame.grid(row=1, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 15))
        status_frame.columnconfigure(1, weight=1)
        
        # Status indicators
        ttk.Label(status_frame, text="API Server:", style='Status.TLabel').grid(row=0, column=0, sticky=tk.W, pady=5)
        self.server_status_label = ttk.Label(status_frame, text="●  Stopped", 
                                           foreground="#E74C3C", style='Status.TLabel')
        self.server_status_label.grid(row=0, column=1, sticky=tk.W, padx=(15, 0), pady=5)
        
        ttk.Label(status_frame, text="AI Model:", style='Status.TLabel').grid(row=1, column=0, sticky=tk.W, pady=5)
        self.model_status_label = ttk.Label(status_frame, text="●  Not Loaded", 
                                          foreground="#E74C3C", style='Status.TLabel')
        self.model_status_label.grid(row=1, column=1, sticky=tk.W, padx=(15, 0), pady=5)
        
        ttk.Label(status_frame, text="Port:", style='Status.TLabel').grid(row=2, column=0, sticky=tk.W, pady=5)
        self.port_label = ttk.Label(status_frame, text=str(self.port), style='Status.TLabel')
        self.port_label.grid(row=2, column=1, sticky=tk.W, padx=(15, 0), pady=5)
        
        # Control buttons frame
        button_frame = ttk.Frame(main_frame, style='Modern.TFrame')
        button_frame.grid(row=3, column=0, columnspan=3, pady=20)
        
        # Create a style for rounded buttons
        style = ttk.Style()
        
        # Configure rounded button styles using tkinter's button relief options
        style.configure('RoundedStart.TButton',
                       background='#3498DB',
                       foreground='white',
                       font=('Segoe UI', 10, 'bold'),
                       borderwidth=0,
                       focuscolor='none',
                       relief='raised',  # Use raised for rounded appearance
                       padding=(20, 10))
        
        style.map('RoundedStart.TButton',
                 background=[('active', '#2980B9'),
                           ('pressed', '#1F618D')])
        
        style.configure('RoundedStop.TButton',
                       background='#E74C3C',
                       foreground='white',
                       font=('Segoe UI', 10, 'bold'),
                       borderwidth=0,
                       focuscolor='none',
                       relief='raised',  # Use raised for rounded appearance
                       padding=(20, 10))
        
        style.map('RoundedStop.TButton',
                 background=[('active', '#C0392B'),
                           ('pressed', '#A93226')])
        
        # Start API button
        self.start_button = ttk.Button(button_frame, text="🚀 Turn On API", 
                                     command=self.start_api, style="RoundedStart.TButton")
        self.start_button.pack(side=tk.LEFT, padx=(0, 15))
        
        # Stop API button
        self.stop_button = ttk.Button(button_frame, text="⏹️ Turn Off API", 
                                    command=self.stop_api, state=tk.DISABLED,
                                    style="RoundedStop.TButton")
        self.stop_button.pack(side=tk.LEFT)
        
        # Log display
        log_frame = ttk.LabelFrame(main_frame, text="System Log", 
                                  padding="10", style='Log.TLabelframe')
        log_frame.grid(row=2, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(15, 0))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, 
                                                 height=15, width=70,
                                                 bg='#F8F9FA',  # Light gray background
                                                 fg='#2C3E50',  # Dark text
                                                 font=('Consolas', 9),
                                                 relief='solid',  # Changed to solid for visible border
                                                 borderwidth=1,   # Added visible border
                                                 selectbackground='#3498DB',
                                                 selectforeground='white')
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Clear log button
        clear_log_btn = ttk.Button(log_frame, text="🗑️ Clear Log", 
                                  command=self.clear_log, 
                                  style="RoundedStart.TButton")
        clear_log_btn.grid(row=1, column=0, pady=(10, 0))
    
    def resource_path(self, relative_path):
        """Get absolute path to resource, works for dev and for PyInstaller"""
        try:
            # PyInstaller creates a temp folder and stores path in _MEIPASS
            base_path = sys._MEIPASS
        except Exception:
            base_path = os.path.abspath(".")
        return os.path.join(base_path, relative_path)
    
    def load_model_async(self):
        """Load the model in a separate thread"""
        def load_model():
            try:
                model_path = self.resource_path('alphabet_keras/asl_alphabet_model.h5')
                
                if not os.path.exists(model_path):
                    self.logger.error(f"Model file not found: {model_path}")
                    self.root.after(0, lambda: self.update_model_status("Not Found", "red"))
                    return
                
                self.logger.info("Loading ASL model...")
                self.model = tf_load_model(model_path)
                self.model_loaded = True
                self.logger.info(f"Model loaded successfully. Input shape: {self.model.input_shape}")
                self.root.after(0, lambda: self.update_model_status("Loaded", "#27AE60"))
                
            except Exception as e:
                self.logger.error(f"Model loading failed: {str(e)}")
                self.root.after(0, lambda: self.update_model_status("Load Failed", "red"))
        
        thread = threading.Thread(target=load_model, daemon=True)
        thread.start()
    
    def update_model_status(self, status, color):
        """Update model status in GUI"""
        status_text = f"●  {status}"
        self.model_status_label.config(text=status_text, foreground=color)
    
    def update_server_status(self, status, color):
        """Update server status in GUI"""
        status_text = f"●  {status}"
        self.server_status_label.config(text=status_text, foreground=color)
    
    def find_free_port(self):
        """Find a free port for the server"""
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            s.bind(('', 0))
            s.listen(1)
            port = s.getsockname()[1]
        return port
    
    def create_flask_app(self):
        """Create and configure Flask app"""
        app = Flask(__name__)
        CORS(app, resources={r"/*": {"origins": "*"}})
        
        @app.route('/predict', methods=['POST'])
        def predict():
            return self.handle_predict(request)
        
        @app.route('/clear-buffer', methods=['POST'])
        def clear_buffer():
            self.prediction_buffer.clear()
            return jsonify({
                'status': 'success',
                'message': 'Prediction buffer cleared'
            })
        
        @app.route('/health', methods=['GET'])
        def health_check():
            return jsonify({
                'status': 'healthy' if self.model_loaded else 'unhealthy',
                'model_loaded': self.model_loaded,
                'buffer_size': len(self.prediction_buffer)
            })
        
        return app
    
    def handle_predict(self, request):
        """Handle prediction requests"""
        if not self.model_loaded:
            return jsonify({'error': 'Model not loaded'}), 500
        
        try:
            data = request.json
            if not data or 'image' not in data:
                return jsonify({'error': 'No image data'}), 400
            
            # Extract image data
            image_data = data['image'].split(',')[1] if ',' in data['image'] else data['image']
            
            # Decode and process image
            image_bytes = base64.b64decode(image_data)
            img_array = np.frombuffer(image_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            if img is None:
                raise ValueError("Failed to decode image")
            
            # Extract hand landmarks
            landmarks = self.extract_hand_landmarks(img)
            
            if landmarks is None:
                self.prediction_buffer.append(('nothing', 1.0))
                most_common = self.get_most_common_prediction()
                return jsonify({
                    'letter': most_common[0],
                    'confidence': most_common[1],
                    'message': 'No hand detected',
                    'buffer_size': len(self.prediction_buffer)
                })
            
            # Reshape and normalize landmarks for the model
            landmarks = landmarks.reshape(1, 63)  # 21 landmarks × 3 coordinates
            landmarks = landmarks / np.max(landmarks)  # Normalize same as in training
            
            # Make prediction
            predictions = self.model.predict(landmarks)
            predicted_class_index = np.argmax(predictions[0])
            predicted_class = self.ASL_CLASSES[predicted_class_index]
            confidence = float(np.max(predictions[0]))
            
            # Add to prediction buffer if confidence is above threshold
            if confidence > self.CONFIDENCE_THRESHOLD:
                self.prediction_buffer.append((predicted_class, confidence))
            
            # Get most common prediction from buffer
            most_common = self.get_most_common_prediction()
            
            self.logger.info(f"Prediction: {predicted_class} ({confidence:.2%}) -> {most_common[0]}")
            
            return jsonify({
                'letter': most_common[0],
                'raw_letter': predicted_class,
                'confidence': most_common[1],
                'raw_confidence': confidence,
                'buffer_size': len(self.prediction_buffer)
            })
            
        except Exception as e:
            self.logger.error(f"Prediction error: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    def extract_hand_landmarks(self, image):
        """Extract hand landmarks using MediaPipe"""
        try:
            # Convert to RGB (MediaPipe requires RGB)
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.hands.process(image_rgb)
            
            if results.multi_hand_landmarks:
                landmarks = []
                for hand_landmarks in results.multi_hand_landmarks:
                    for landmark in hand_landmarks.landmark:
                        landmarks.extend([landmark.x, landmark.y, landmark.z])
                return np.array(landmarks)
            return None
        except Exception as e:
            self.logger.error(f"Landmark extraction error: {str(e)}")
            return None
    
    def get_most_common_prediction(self):
        """Return the most common prediction from the buffer"""
        if not self.prediction_buffer:
            return ('nothing', 1.0)
        
        # Count the occurrences of each prediction
        predictions = [item[0] for item in self.prediction_buffer]
        counts = Counter(predictions)
        most_common = counts.most_common(1)[0][0]
        
        # Calculate average confidence for the most common prediction
        confidences = [item[1] for item in self.prediction_buffer if item[0] == most_common]
        avg_confidence = sum(confidences) / len(confidences)
        
        return (most_common, avg_confidence)
    
    def start_api(self):
        """Start the Flask API server"""
        if self.server_running:
            return
        
        if not self.model_loaded:
            messagebox.showerror("Error", "Model not loaded. Please wait for model to load first.")
            return
        
        try:
            # Use the configured port (from environment or default 5000)
            self.port_label.config(text=str(self.port))
            
            # Create Flask app
            self.flask_app = self.create_flask_app()
            
            # Start server in separate thread
            def run_server():
                try:
                    self.logger.info(f"Starting API server on port {self.port}")
                    self.flask_app.run(host='0.0.0.0', port=self.port, debug=False, threaded=True)
                except Exception as e:
                    self.logger.error(f"Server error: {str(e)}")
                    self.root.after(0, self.on_server_stopped)
            
            self.server_thread = threading.Thread(target=run_server, daemon=True)
            self.server_thread.start()
            
            # Update UI
            self.server_running = True
            self.update_server_status("Running", "#27AE60")  # Green
            self.start_button.config(state=tk.DISABLED)
            self.stop_button.config(state=tk.NORMAL)
            
            self.logger.info(f"API server started successfully on port {self.port}")
            
        except Exception as e:
            self.logger.error(f"Failed to start server: {str(e)}")
            messagebox.showerror("Error", f"Failed to start server: {str(e)}")
    
    def stop_api(self):
        """Stop the Flask API server"""
        if not self.server_running:
            return
        
        try:
            self.logger.info("Stopping API server...")
            
            # Flask doesn't have a clean shutdown method, so we'll just mark as stopped
            self.server_running = False
            self.on_server_stopped()
            
            # Note: The actual Flask server thread will continue until the process ends
            # This is a limitation of Flask's development server
            self.logger.info("API server stop requested (thread may continue until app closes)")
            
        except Exception as e:
            self.logger.error(f"Error stopping server: {str(e)}")
    
    def on_server_stopped(self):
        """Called when server stops"""
        self.server_running = False
        self.update_server_status("Stopped", "#E74C3C")  # Red
        self.start_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
    
    def process_log_queue(self):
        """Process log messages from queue and display in GUI"""
        try:
            while True:
                record = self.log_queue.get_nowait()
                message = record.getMessage()
                self.log_text.insert(tk.END, message + '\n')
                self.log_text.see(tk.END)
        except queue.Empty:
            pass
        
        # Schedule next check
        self.root.after(100, self.process_log_queue)
    
    def clear_log(self):
        """Clear the log display"""
        self.log_text.delete(1.0, tk.END)
    
    def on_closing(self):
        """Handle window closing"""
        if self.server_running:
            self.stop_api()
        self.root.destroy()

class QueueHandler(logging.Handler):
    """Custom logging handler that puts messages in a queue"""
    def __init__(self, log_queue):
        super().__init__()
        self.log_queue = log_queue
    
    def emit(self, record):
        self.log_queue.put(record)

def main():
    root = tk.Tk()
    app = PalmSpeakControlCentre(root)
    
    # Handle window closing
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    # Start the GUI
    root.mainloop()

if __name__ == "__main__":
    main()