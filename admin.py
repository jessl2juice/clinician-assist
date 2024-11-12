from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from flask_socketio import emit
from models import User, AuditLog, ChatMessage
from extensions import db, socketio
from utils import log_audit
from functools import wraps
from forms import EditUserForm
from datetime import datetime, timedelta
from sqlalchemy import func, desc

admin = Blueprint('admin', __name__)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            flash('You do not have permission to access this page.', 'danger')
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    return decorated_function

@admin.route('/users')
@login_required
@admin_required
def user_list():
    users = User.query.all()
    return render_template('admin/users.html', users=users)

@admin.route('/audit-logs')
@login_required
@admin_required
def audit_logs():
    logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).all()
    return render_template('admin/audit_logs.html', audit_logs=logs)

@admin.route('/system-status')
@login_required
@admin_required
def system_status():
    # User statistics
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    users_by_role = db.session.query(
        User.role, 
        func.count(User.id)
    ).group_by(User.role).all()

    # Recent activity
    last_24h = datetime.utcnow() - timedelta(hours=24)
    recent_logins = AuditLog.query.filter(
        AuditLog.action == 'login',
        AuditLog.timestamp > last_24h
    ).count()

    recent_registrations = User.query.filter(
        User.created_at > last_24h
    ).count()

    # Audit log statistics
    total_actions = AuditLog.query.count()
    recent_actions = AuditLog.query.filter(
        AuditLog.timestamp > last_24h
    ).count()

    # Most common actions
    common_actions = db.session.query(
        AuditLog.action,
        func.count(AuditLog.id).label('count')
    ).group_by(AuditLog.action).order_by(
        func.count(AuditLog.id).desc()
    ).limit(5).all()

    metrics = {
        'total_users': total_users,
        'active_users': active_users,
        'users_by_role': dict(users_by_role),
        'recent_logins': recent_logins,
        'recent_registrations': recent_registrations,
        'total_actions': total_actions,
        'recent_actions': recent_actions,
        'common_actions': common_actions
    }

    return render_template('admin/system_status.html', metrics=metrics)

@admin.route('/dashboard')
@login_required
@admin_required
def admin_dashboard():
    users = User.query.all()
    return render_template('dashboard/admin.html', users=users)

@socketio.on('admin_get_messages')
@login_required
def handle_get_messages(data):
    if current_user.role != 'admin':
        return

    query = ChatMessage.query.join(User).order_by(desc(ChatMessage.timestamp))

    if data.get('user_id'):
        query = query.filter(ChatMessage.user_id == data['user_id'])
    if data.get('message_type'):
        query = query.filter(ChatMessage.message_type == data['message_type'])
    if data.get('flagged') == 'true':
        query = query.filter(ChatMessage.flagged == True)

    messages = query.limit(50).all()
    message_list = [{
        'id': msg.id,
        'content': msg.content,
        'user_email': msg.user.email,
        'timestamp': msg.timestamp.isoformat(),
        'message_type': msg.message_type,
        'voice_url': msg.voice_url,
        'flagged': msg.flagged,
        'monitor_notes': msg.monitor_notes
    } for msg in messages]

    emit('admin_messages', {'messages': message_list})

@socketio.on('admin_get_message_details')
@login_required
def handle_get_message_details(data):
    if current_user.role != 'admin':
        return

    message = ChatMessage.query.get(data['message_id'])
    if message:
        details = {
            'id': message.id,
            'content': message.content,
            'user_email': message.user.email,
            'timestamp': message.timestamp.isoformat(),
            'message_type': message.message_type,
            'voice_url': message.voice_url,
            'flagged': message.flagged,
            'monitor_notes': message.monitor_notes
        }
        emit('admin_message_details', details)

@socketio.on('admin_flag_message')
@login_required
def handle_flag_message(data):
    if current_user.role != 'admin':
        return

    message = ChatMessage.query.get(data['message_id'])
    if message:
        message.flagged = data['flagged']
        db.session.commit()
        log_audit(current_user.id, 'message_flagged', f'Message {message.id} flagged by admin', request.remote_addr)
        emit('admin_message_updated', {
            'message_id': message.id,
            'flagged': message.flagged
        })

@socketio.on('admin_save_notes')
@login_required
def handle_save_notes(data):
    if current_user.role != 'admin':
        return

    message = ChatMessage.query.get(data['message_id'])
    if message:
        message.monitor_notes = data['notes']
        db.session.commit()
        log_audit(current_user.id, 'message_notes_updated', f'Monitoring notes updated for message {message.id}', request.remote_addr)
        emit('admin_message_updated', {
            'message_id': message.id,
            'monitor_notes': message.monitor_notes
        })

@admin.route('/users/<int:user_id>/toggle_active', methods=['POST'])
@login_required
@admin_required
def toggle_user_active(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        flash('You cannot deactivate your own account.', 'danger')
    else:
        user.is_active = not user.is_active
        db.session.commit()
        action = 'activated' if user.is_active else 'deactivated'
        log_audit(current_user.id, f'user_{action}', f'User {user.email} {action}', request.remote_addr)
        flash(f'User {action} successfully.', 'success')
    return redirect(url_for('admin.user_list'))

@admin.route('/users/<int:user_id>/edit', methods=['GET', 'POST'])
@login_required
@admin_required
def edit_user(user_id):
    user = User.query.get_or_404(user_id)
    form = EditUserForm(obj=user)
    
    if form.validate_on_submit():
        if user.id == current_user.id and form.role.data != 'admin':
            flash('You cannot change your own admin role.', 'danger')
            return redirect(url_for('admin.user_list'))
            
        user.email = form.email.data
        user.role = form.role.data
        user.is_active = form.is_active.data
        
        if form.password.data:
            user.set_password(form.password.data)
            log_audit(current_user.id, 'password_changed', f'Password changed for user {user.email}', request.remote_addr)
            
        db.session.commit()
        log_audit(current_user.id, 'user_edited', f'User {user.email} details updated', request.remote_addr)
        flash('User updated successfully.', 'success')
        return redirect(url_for('admin.user_list'))
        
    return render_template('admin/edit_user.html', form=form, user=user)

@admin.route('/users/<int:user_id>/delete', methods=['POST'])
@login_required
@admin_required
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        flash('You cannot delete your own account.', 'danger')
    else:
        email = user.email
        db.session.delete(user)
        db.session.commit()
        log_audit(current_user.id, 'user_deleted', f'User {email} deleted', request.remote_addr)
        flash('User deleted successfully.', 'success')
    return redirect(url_for('admin.user_list'))
