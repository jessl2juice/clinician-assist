import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, redirect, url_for, session, request, jsonify, send_from_directory
from flask_login import current_user, login_required
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta
from config import Config
from extensions import db, login_manager, session as flask_session
from models import User, ChatMessage
from auth import auth
from admin import admin
from chat_service import ChatService
import os
import traceback
import logging

app = Flask(__name__)
app.config.from_object(Config)

# Setup logging
logging.basicConfig(level=logging.DEBUG)
app.logger.setLevel(logging.DEBUG)

# Initialize database with retry logic
Config.init_db(app)

# Initialize extensions
db.init_app(app)
login_manager.init_app(app)
flask_session.init_app(app)
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins='*')
chat_service = ChatService()

# Configure login
login_manager.login_view = 'auth.login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

app.register_blueprint(auth, url_prefix='/auth')
app.register_blueprint(admin, url_prefix='/admin')

def create_directories():
    """Create necessary directories with proper permissions"""
    voice_messages_dir = os.path.join(app.static_folder or 'static', 'voice_messages')
    os.makedirs(voice_messages_dir, exist_ok=True)
    os.chmod(voice_messages_dir, 0o777)  # Ensure full permissions for voice messages
    app.logger.info(f"Voice messages directory created/verified at: {voice_messages_dir}")

@app.before_request
def before_request():
    if current_user.is_authenticated:
        session.permanent = True
        app.permanent_session_lifetime = timedelta(minutes=30)
    
    # Create necessary directories if they don't exist
    with app.app_context():
        create_directories()

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('auth.login'))

@app.route('/dashboard')
@login_required
def dashboard():
    if current_user.role == 'admin':
        return render_template('dashboard/admin.html')
    elif current_user.role == 'therapist':
        return render_template('dashboard/therapist.html')
    else:
        chat_messages = ChatMessage.query.filter_by(user_id=current_user.id).order_by(ChatMessage.timestamp).all()
        messages = [{
            'content': msg.content,
            'timestamp': msg.timestamp,
            'is_ai_response': msg.is_ai_response
        } for msg in chat_messages]
        return render_template('dashboard/client.html', messages=messages)

@app.route('/voice-message', methods=['POST'])
@login_required
def handle_voice_message():
    try:
        if current_user.role != 'client':
            app.logger.warning(f"Unauthorized voice message attempt by {current_user.email}")
            return jsonify({'success': False, 'error': 'Unauthorized access'}), 403
        
        if 'audio' not in request.files:
            app.logger.warning("No audio file in request")
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        app.logger.info(f"Received audio file: {audio_file.filename}, Content-Type: {audio_file.content_type}, Size: {request.content_length} bytes")
        
        if not audio_file.filename or not audio_file.content_type.startswith('audio/'):
            app.logger.warning(f"Invalid audio file: {audio_file.filename}, {audio_file.content_type}")
            return jsonify({'success': False, 'error': 'Invalid audio file format'}), 400
        
        # Verify voice messages directory exists with proper permissions
        voice_messages_dir = os.path.join(app.static_folder or 'static', 'voice_messages')
        if not os.path.exists(voice_messages_dir):
            create_directories()
            app.logger.info("Voice messages directory created")
        
        # Process the voice message
        result = chat_service.process_voice_message(audio_file, current_user)
        app.logger.debug(f"Voice message processing result: {result}")
        
        if result.get('success', False):
            return jsonify({
                'success': True,
                'transcript': result.get('transcript'),
                'ai_response': result.get('ai_response'),
                'ai_audio_url': result.get('ai_audio_url')
            })
        
        error_message = result.get('error', 'Failed to process voice message')
        app.logger.error(f"Voice message processing error: {error_message}")
        return jsonify({
            'success': False,
            'error': error_message
        }), 500
        
    except Exception as e:
        error_details = traceback.format_exc()
        app.logger.error(f"Error in handle_voice_message: {str(e)}\n{error_details}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder or 'static', filename)

@socketio.on('send_message')
def handle_message(data):
    if not current_user.is_authenticated or current_user.role != 'client':
        return
    
    try:
        # Save user message
        user_message = ChatMessage(user_id=current_user.id, is_ai_response=False)
        user_message.set_content(data['message'])
        db.session.add(user_message)
        db.session.commit()
        
        # Emit the user message
        emit('new_message', {
            'content': data['message'],
            'timestamp': user_message.timestamp.isoformat(),
            'is_ai_response': False
        })
        
        # Get and emit AI response
        emit('typing_indicator', {'typing': True})
        ai_response = chat_service.get_ai_response(data['message'], current_user)
        emit('typing_indicator', {'typing': False})
        
        emit('new_message', {
            'content': ai_response,
            'timestamp': datetime.utcnow().isoformat(),
            'is_ai_response': True
        })
        
    except Exception as e:
        error_details = traceback.format_exc()
        app.logger.error(f"Error in handle_message: {str(e)}\n{error_details}")
        emit('error', {'message': 'Failed to process message'})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        create_directories()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=True, log_output=True)
