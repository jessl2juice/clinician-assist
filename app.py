from flask import Flask, render_template, redirect, url_for, session, request
from flask_login import current_user, login_required
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta
from config import Config
from extensions import db, login_manager, session as flask_session
from models import User, ChatMessage
from auth import auth
from admin import admin
from chat_service import ChatService
import json

app = Flask(__name__)
app.config.from_object(Config)

# Initialize database with retry logic
Config.init_db(app)

# Initialize extensions
db.init_app(app)
login_manager.init_app(app)
flask_session.init_app(app)
socketio = SocketIO(app)
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

@socketio.on('send_message')
@login_required
def handle_message(data):
    if current_user.role != 'client':
        return
    
    # Save user message directly
    user_message = ChatMessage(user_id=current_user.id, is_ai_response=False)
    user_message.content = data['message']
    db.session.add(user_message)
    db.session.commit()
    
    # Emit the user message to the client
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, host='0.0.0.0', port=5000, use_reloader=True, log_output=True)
