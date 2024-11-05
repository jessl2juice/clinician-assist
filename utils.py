from models import AuditLog
from extensions import db
from datetime import datetime
import bleach

def log_audit(user_id, action, details, ip_address):
    log = AuditLog(
        user_id=user_id,
        action=action,
        details=details,
        ip_address=ip_address,
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()

def sanitize_input(text):
    return bleach.clean(text, tags=[], strip=True)

def validate_password_strength(password):
    """
    Validates password strength according to HIPAA requirements
    Returns (bool, str) tuple - (is_valid, error_message)
    """
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    if not any(c in '!@#$%^&*(),.?":{}|<>' for c in password):
        return False, "Password must contain at least one special character"
    return True, ""
