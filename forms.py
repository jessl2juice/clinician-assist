from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SelectField, BooleanField
from wtforms.validators import DataRequired, Email, Length, ValidationError
import re

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])

class RegistrationForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=8)])
    role = SelectField('Role', choices=[('client', 'Client'), 
                                      ('therapist', 'Therapist'), 
                                      ('admin', 'Admin')])
    
    def validate_password(self, field):
        if not re.search(r'[A-Z]', field.data):
            raise ValidationError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', field.data):
            raise ValidationError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', field.data):
            raise ValidationError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', field.data):
            raise ValidationError('Password must contain at least one special character')

class EditUserForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    role = SelectField('Role', choices=[('client', 'Client'), 
                                      ('therapist', 'Therapist'), 
                                      ('admin', 'Admin')])
    is_active = BooleanField('Active')
    password = PasswordField('New Password', validators=[Length(min=8)])

    def validate_password(self, field):
        if field.data:  # Only validate if password is being changed
            if not re.search(r'[A-Z]', field.data):
                raise ValidationError('Password must contain at least one uppercase letter')
            if not re.search(r'[a-z]', field.data):
                raise ValidationError('Password must contain at least one lowercase letter')
            if not re.search(r'\d', field.data):
                raise ValidationError('Password must contain at least one number')
            if not re.search(r'[!@#$%^&*(),.?":{}|<>]', field.data):
                raise ValidationError('Password must contain at least one special character')
