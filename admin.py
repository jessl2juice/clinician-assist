from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from models import User, AuditLog
from extensions import db
from utils import log_audit
from functools import wraps
from forms import EditUserForm

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
