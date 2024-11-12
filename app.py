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

app = Flask(__name__)
app.config.from_object(Config)

# Initialize database with retry logic
Config.init_db(app)

# Initialize extensions
db.init_app(app)
login_manager.init_app(app)
flask_session.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
chat_service = ChatService()

login_manager.login_view = 'auth.login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

app.register_blueprint(auth, url_prefix='/auth')
app.register_blueprint(admin, url_prefix='/admin')

@app.before_request
def before_request():
    if current_user.is_authenticated:
        session.permanent = True
        app.permanent_session_lifetime = timedelta(minutes=30)

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
    else:
        chat_messages = ChatMessage.query.filter_by(user_id=current_user.id).order_by(ChatMessage.timestamp.desc()).all()
        messages = [{
            'content': msg.content,
            'timestamp': msg.timestamp,
            'is_ai_response': msg.is_ai_response
        } for msg in chat_messages]
        if current_user.role == 'therapist':
            return render_template('dashboard/therapist.html', messages=messages)
        else:
            return render_template('dashboard/client.html', messages=messages)

@app.route('/voice-message', methods=['POST'])
@login_required
def handle_voice_message():
    try:
        if current_user.role not in ['client', 'therapist']:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if not audio_file or not audio_file.filename:
            return jsonify({'success': False, 'error': 'Empty audio file'}), 400
        
        # Process the voice message
        result = chat_service.process_voice_message(audio_file, current_user)
        
        if result and result.get('success', False):
            return jsonify({
                'success': True,
                'transcript': result.get('transcript'),
                'ai_response': result.get('ai_response'),
                'ai_audio_url': result.get('ai_audio_url')
            })
        
        return jsonify({
            'success': False,
            'error': result.get('error', 'Failed to process voice message')
        }), 500
        
    except Exception as e:
        app.logger.error(f"Error in handle_voice_message: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'An unexpected error occurred: {str(e)}'
        }), 500

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@socketio.on('send_message')
def handle_message(data):
    if not current_user.is_authenticated or current_user.role not in ['client', 'therapist']:
        return
    
    try:
        # Save user message
        user_message = ChatMessage(user_id=current_user.id, is_ai_response=False)
        user_message.content = data['message']
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
        
        if ai_response:
            emit('new_message', {
                'content': ai_response,
                'timestamp': datetime.utcnow().isoformat(),
                'is_ai_response': True
            })
        else:
            emit('error', {'message': 'Failed to get AI response'})
        
    except Exception as e:
        app.logger.error(f"Error in handle_message: {str(e)}")
        emit('error', {'message': 'Failed to process message'})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, 
        host='0.0.0.0',
        port=5000,
        allow_unsafe_werkzeug=True,
        debug=True
    )
