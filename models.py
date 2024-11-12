from datetime import datetime, timedelta
from extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import secrets

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, default=False)
    email_verified = db.Column(db.Boolean, default=False)
    verification_token = db.Column(db.String(100), unique=True)
    verification_token_expires = db.Column(db.DateTime)
    failed_login_attempts = db.Column(db.Integer, default=0)
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    audit_logs = db.relationship('AuditLog', backref='user', lazy=True)
    chat_messages = db.relationship('ChatMessage', backref='user', lazy=True)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def generate_verification_token(self):
        self.verification_token = secrets.token_urlsafe(32)
        self.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
        return self.verification_token

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    action = db.Column(db.String(50), nullable=False)
    details = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    ip_address = db.Column(db.String(45))

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_ai_response = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    message_type = db.Column(db.String(10), default='text')  # 'text' or 'voice'
    voice_url = db.Column(db.String(255))  # URL for voice messages
    monitored = db.Column(db.Boolean, default=False)  # For admin monitoring
    flagged = db.Column(db.Boolean, default=False)  # For flagging concerning messages
    monitor_notes = db.Column(db.Text)  # Admin notes on monitored messages
    sentiment_score = db.Column(db.Float)  # Sentiment score from -1 to 1
    sentiment_label = db.Column(db.String(50))  # Positive, Negative, or Neutral
    sentiment_analysis = db.Column(db.Text)  # Detailed sentiment analysis

    def set_content(self, content):
        self.content = content

    def get_content(self):
        return self.content
