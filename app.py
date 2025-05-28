# app.py - Flask API for ASL recognition (corrected version with prediction smoothing)
from flask import Flask, request, jsonify
import numpy as np
from tensorflow.keras.models import load_model
from PIL import Image
import io
import base64
from flask_cors import CORS
import logging
import traceback
import os
import cv2
import mediapipe as mp
from collections import deque, Counter

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('palmspeak-api')

# Global variables
model = None
model_loaded = False
ASL_CLASSES = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'del', 'nothing', 'space'
]

# Prediction buffer to store recent predictions
prediction_buffer = deque(maxlen=10)
# Minimum confidence threshold for prediction to be considered valid
CONFIDENCE_THRESHOLD = 0.3

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=True, max_num_hands=1)

def load_keras_model():
    """Load the Keras model on startup"""
    global model, model_loaded
    try:
        model_path = 'alphabet_keras/asl_alphabet_model.h5'
        
        if not os.path.exists(model_path):
            logger.error(f"Model file not found: {model_path}")
            return False
            
        model = load_model(model_path)
        model_loaded = True
        logger.info("Model loaded successfully. Input shape: %s", model.input_shape)
        return True
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}")
        traceback.print_exc()
        return False

def extract_hand_landmarks(image):
    """Extract hand landmarks using MediaPipe"""
    try:
        # Convert to RGB (MediaPipe requires RGB)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = hands.process(image_rgb)
        
        if results.multi_hand_landmarks:
            landmarks = []
            for hand_landmarks in results.multi_hand_landmarks:
                for landmark in hand_landmarks.landmark:
                    landmarks.extend([landmark.x, landmark.y, landmark.z])
            return np.array(landmarks)
        return None
    except Exception as e:
        logger.error(f"Landmark extraction error: {str(e)}")
        return None

@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint to process an image and return ASL prediction"""
    global model, model_loaded, prediction_buffer
    
    if not model_loaded:
        if not load_keras_model():
            return jsonify({'error': 'Model not loaded'}), 500

    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data'}), 400

        # Extract image data
        image_data = data['image'].split(',')[1] if ',' in data['image'] else data['image']
        
        try:
            # Decode and process image
            image_bytes = base64.b64decode(image_data)
            img_array = np.frombuffer(image_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            if img is None:
                raise ValueError("Failed to decode image")
            
            # Extract hand landmarks
            landmarks = extract_hand_landmarks(img)
            
            if landmarks is None:
                prediction_buffer.append(('nothing', 1.0))
                most_common = get_most_common_prediction()
                return jsonify({
                    'letter': most_common[0],
                    'confidence': most_common[1],
                    'message': 'No hand detected',
                    'buffer_size': len(prediction_buffer)
                })
                
            # Reshape and normalize landmarks for the model
            landmarks = landmarks.reshape(1, 63)  # 21 landmarks × 3 coordinates
            landmarks = landmarks / np.max(landmarks)  # Normalize same as in training

            # Make prediction
            predictions = model.predict(landmarks)
            predicted_class_index = np.argmax(predictions[0])
            predicted_class = ASL_CLASSES[predicted_class_index]
            confidence = float(np.max(predictions[0]))
            
            # Add to prediction buffer if confidence is above threshold
            if confidence > CONFIDENCE_THRESHOLD:
                prediction_buffer.append((predicted_class, confidence))
            
            # Get most common prediction from buffer
            most_common = get_most_common_prediction()
            
            logger.info(f"Current: {predicted_class} ({confidence:.2%}), Most common: {most_common[0]} ({most_common[1]:.2%})")
            
            return jsonify({
                'letter': most_common[0],
                'raw_letter': predicted_class,
                'confidence': most_common[1],
                'raw_confidence': confidence,
                'buffer_size': len(prediction_buffer)
            })

        except Exception as e:
            logger.error(f"Image processing error: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': 'Invalid image format'}), 400

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def get_most_common_prediction():
    """Return the most common prediction from the buffer"""
    if not prediction_buffer:
        return ('nothing', 1.0)
    
    # Count the occurrences of each prediction
    predictions = [item[0] for item in prediction_buffer]
    counts = Counter(predictions)
    most_common = counts.most_common(1)[0][0]
    
    # Calculate average confidence for the most common prediction
    confidences = [item[1] for item in prediction_buffer if item[0] == most_common]
    avg_confidence = sum(confidences) / len(confidences)
    
    return (most_common, avg_confidence)

@app.route('/clear-buffer', methods=['POST'])
def clear_buffer():
    """Endpoint to clear the prediction buffer (useful when changing signs)"""
    global prediction_buffer
    prediction_buffer.clear()
    return jsonify({
        'status': 'success',
        'message': 'Prediction buffer cleared'
    })

@app.route('/health', methods=['GET'])
def health_check():
    """API health endpoint"""
    if not model_loaded:
        load_keras_model()
    return jsonify({
        'status': 'healthy' if model_loaded else 'unhealthy',
        'model_loaded': model_loaded,
        'buffer_size': len(prediction_buffer)
    })

if __name__ == '__main__':
    load_keras_model()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
    print("=" * 80)
    print(f"ASL Recognition API running on port {port}")
    print("=" * 80)