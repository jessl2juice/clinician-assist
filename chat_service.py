import openai
from flask import current_app
import os
from models import ChatMessage, AuditLog
from extensions import db
import json

class ChatService:
    def __init__(self):
        self.client = openai.Client(api_key=os.environ.get('OPENAI_API_KEY'))
        
    def get_ai_response(self, user_message, user):
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful therapist assistant. Provide supportive and professional responses while maintaining HIPAA compliance. Do not store or repeat sensitive personal information."},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=150
            )
            
            # New API response format parsing
            ai_message = response.choices[0].message.content
            
            # Create and save the AI response with encryption
            chat_message = ChatMessage(user_id=user.id, is_ai_response=True)
            chat_message.set_content(ai_message)
            
            db.session.add(chat_message)
            
            # Log the interaction (maintaining audit trail)
            audit_log = AuditLog(
                user_id=user.id,
                action='ai_chat_response',
                details=json.dumps({'message_id': chat_message.id})
            )
            db.session.add(audit_log)
            db.session.commit()
            
            return ai_message
            
        except Exception as e:
            current_app.logger.error(f"Error getting AI response: {str(e)}")
            return "I apologize, but I'm unable to process your request at the moment. Please try again later."
