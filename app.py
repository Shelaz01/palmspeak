# app.py - Flask API for ASL recognition
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

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Configure CORS to allow requests from extension

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('palmspeak-api')

# Global variable to store the model
model = None
model_loaded = False

# ASL alphabet class labels
ASL_CLASSES = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'del', 'nothing', 'space'
]

def load_keras_model():
    """Load the Keras model on startup"""
    global model, model_loaded
    try:
        # Update this path to where your Keras model is stored
        model_path = 'alphabet_keras/asl_alphabet_model.h5'
        
        # Check if model file exists
        if not os.path.exists(model_path):
            logger.error(f"Model file not found at path: {model_path}")
            return False
            
        model = load_model(model_path)
        model_loaded = True
        logger.info("ASL model loaded successfully!")
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        traceback.print_exc()
        model_loaded = False
        return False

@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint to process an image and return ASL letter prediction"""
    global model, model_loaded
    
    # Check if model is loaded
    if not model_loaded:
        if not load_keras_model():
            return jsonify({
                'error': 'Model not loaded. Check server logs.'
            }), 500
    
    try:
        # Get base64 image from request
        data = request.json
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400
        
        # Skip the header part of the data URL
        image_data = data['image'].split(',')[1] if ',' in data['image'] else data['image']
        
        # Decode base64 image
        try:
            image_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(image_bytes))
        except Exception as e:
            logger.error(f"Error decoding image: {str(e)}")
            return jsonify({'error': 'Invalid image data'}), 400
        
        # Preprocess image
        img = img.resize((64, 64))
        img_array = np.array(img) / 255.0
        
        # Handle grayscale images
        if len(img_array.shape) == 2:
            img_array = np.stack((img_array,) * 3, axis=-1)
        # Handle RGBA images
        elif img_array.shape[2] == 4:
            img_array = img_array[:, :, :3]
            
        img_array = np.expand_dims(img_array, axis=0)
        
        # Make prediction
        predictions = model.predict(img_array)
        predicted_class = ASL_CLASSES[np.argmax(predictions[0])]
        confidence = float(np.max(predictions[0]))
        
        logger.info(f"Prediction: {predicted_class} with confidence {confidence:.4f}")
        
        return jsonify({
            'letter': predicted_class,
            'confidence': confidence
        })
    except Exception as e:
        logger.error(f"Error in prediction: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint to check API health and model status"""
    global model_loaded
    if not model_loaded:
        # Try to load the model if it's not loaded yet
        load_keras_model()
        
    return jsonify({
        'status': 'healthy',
        'model_loaded': model_loaded
    })

# Load model when app starts
load_keras_model()

if __name__ == '__main__':
    # Start the Flask server
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
    
    # Output a helpful message
    print("=" * 80)
    print("PalmSpeak API Server")
    print("=" * 80)
    print(f"API is running at: http://127.0.0.1:{port}")
    print("API endpoints:")
    print(f"- Health check: http://127.0.0.1:{port}/health")
    print(f"- Prediction: http://127.0.0.1:{port}/predict (POST)")
    print("=" * 80)