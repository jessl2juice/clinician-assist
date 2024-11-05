from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user
from models import User, AuditLog
from forms import LoginForm, RegistrationForm
from extensions import db
from datetime import datetime
from utils import log_audit

auth = Blueprint('auth', __name__)

@auth.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
        
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            if user.failed_login_attempts >= 3:
                flash('Account locked. Please contact support.', 'danger')
                return render_template('auth/login.html', form=form)
                
            login_user(user)
            user.failed_login_attempts = 0
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            log_audit(user.id, 'login', 'Successful login', request.remote_addr)
            return redirect(url_for('dashboard'))
        else:
            if user:
                user.failed_login_attempts += 1
                db.session.commit()
            flash('Invalid email or password', 'danger')
            
    return render_template('auth/login.html', form=form)

@auth.route('/logout')
@login_required
def logout():
    log_audit(current_user.id, 'logout', 'User logged out', request.remote_addr)
    logout_user()
    return redirect(url_for('auth.login'))
