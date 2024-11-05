from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user
from models import User, AuditLog
from forms import LoginForm, RegistrationForm
from extensions import db
from datetime import datetime, timedelta
from utils import log_audit
from email_service import send_verification_email

auth = Blueprint('auth', __name__)

@auth.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
        
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            if not user.email_verified:
                flash('Please verify your email before logging in.', 'warning')
                return render_template('auth/login.html', form=form)
                
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

@auth.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
        
    form = RegistrationForm()
    if form.validate_on_submit():
        if User.query.filter_by(email=form.email.data).first():
            flash('Email already registered', 'danger')
            return render_template('auth/register.html', form=form)
            
        user = User(
            email=form.email.data,
            role=form.role.data,
            is_active=True,
            email_verified=False
        )
        user.set_password(form.password.data)
        verification_token = user.generate_verification_token()
        
        db.session.add(user)
        db.session.commit()
        
        if send_verification_email(user.email, verification_token):
            flash('Registration successful! Please check your email to verify your account.', 'success')
            log_audit(user.id, 'register', 'User registered', request.remote_addr)
            return redirect(url_for('auth.login'))
        else:
            db.session.delete(user)
            db.session.commit()
            flash('Failed to send verification email. Please try again.', 'danger')
            
    return render_template('auth/register.html', form=form)

@auth.route('/verify/<token>')
def verify_email(token):
    user = User.query.filter_by(verification_token=token).first()
    
    if not user:
        flash('Invalid verification link', 'danger')
        return redirect(url_for('auth.login'))
        
    if datetime.utcnow() > user.verification_token_expires:
        flash('Verification link has expired. Please register again.', 'danger')
        return redirect(url_for('auth.register'))
        
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.session.commit()
    
    log_audit(user.id, 'verify_email', 'Email verified', request.remote_addr)
    flash('Email verified successfully! You can now login.', 'success')
    return redirect(url_for('auth.login'))

@auth.route('/logout')
@login_required
def logout():
    log_audit(current_user.id, 'logout', 'User logged out', request.remote_addr)
    logout_user()
    return redirect(url_for('auth.login'))
