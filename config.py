import os
from datetime import timedelta
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
import time

class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-here')
    
    # Database configuration with SSL and retry logic
    database_url = os.environ.get('DATABASE_URL')
    if database_url and 'postgresql' in database_url:
        if '?' not in database_url:
            database_url += '?sslmode=require'
    
    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_timeout': 900,
        'pool_size': 10,
        'max_overflow': 5,
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Security settings
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(minutes=30)
    SESSION_TYPE = 'filesystem'
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Password policy
    PASSWORD_MIN_LENGTH = 8
    PASSWORD_REQUIRE_UPPERCASE = True
    PASSWORD_REQUIRE_LOWERCASE = True
    PASSWORD_REQUIRE_NUMBERS = True
    PASSWORD_REQUIRE_SPECIAL = True
    
    # HIPAA compliance
    MAX_LOGIN_ATTEMPTS = 3
    ACCOUNT_LOCKOUT_DURATION = timedelta(minutes=30)
    
    @staticmethod
    def init_db(app):
        """Initialize database with retry logic"""
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                engine = create_engine(app.config['SQLALCHEMY_DATABASE_URI'])
                engine.connect()
                break
            except OperationalError as e:
                if attempt == max_retries - 1:
                    raise e
                time.sleep(retry_delay * (attempt + 1))
