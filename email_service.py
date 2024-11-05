import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from flask import current_app, url_for

def send_verification_email(user_email, verification_token):
    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    verification_url = url_for('auth.verify_email', 
                             token=verification_token, 
                             _external=True)
    
    message = Mail(
        from_email='noreply@hipaasecure.com',
        to_emails=user_email,
        subject='Verify Your Email - HIPAA Secure',
        html_content=f'''
        <h2>Welcome to HIPAA Secure!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
        <p><a href="{verification_url}">Verify Email Address</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
        '''
    )
    
    try:
        response = sg.send(message)
        return True
    except Exception as e:
        current_app.logger.error(f"Failed to send verification email: {str(e)}")
        return False
