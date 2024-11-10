from flask import Flask, render_template, redirect, url_for, session
from flask_login import current_user, login_required
from datetime import timedelta
from config import Config
from extensions import db, login_manager, session as flask_session
from models import User
from auth import auth
from admin import admin

app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
db.init_app(app)
login_manager.init_app(app)
flask_session.init_app(app)

login_manager.login_view = 'auth.login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

app.register_blueprint(auth, url_prefix='/auth')
app.register_blueprint(admin, url_prefix='/admin')

@app.before_request
def before_request():
    if current_user.is_authenticated:
        # Auto logout after session timeout
        session.permanent = True
        app.permanent_session_lifetime = timedelta(minutes=30)

@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('application.html')
    return redirect(url_for('auth.login'))

@app.route('/dashboard')
@login_required
def dashboard():
    if current_user.role == 'admin':
        return render_template('dashboard/admin.html')
    elif current_user.role == 'therapist':
        return render_template('dashboard/therapist.html')
    else:
        return render_template('dashboard/client.html')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000)
