import openai
from flask import current_app
import os
from models import ChatMessage, AuditLog
from extensions import db
import json
import speech_recognition as sr
from pydub import AudioSegment
import io
import tempfile

class ChatService:
    def __init__(self):
        self.client = openai.Client(api_key=os.environ.get('OPENAI_API_KEY'))
        self.recognizer = sr.Recognizer()
        
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
            
            # Get AI response
            ai_message = response.choices[0].message.content
            
            # Create and save the AI response directly
            chat_message = ChatMessage(user_id=user.id, is_ai_response=True)
            chat_message.content = ai_message
            
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
            
    def process_voice_message(self, audio_data, user):
        try:
            # Convert audio data to WAV format
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_audio:
                audio_segment = AudioSegment.from_file(io.BytesIO(audio_data))
                audio_segment.export(temp_audio.name, format='wav')
                
                # Perform speech recognition
                with sr.AudioFile(temp_audio.name) as source:
                    audio = self.recognizer.record(source)
                    transcript = self.recognizer.recognize_google(audio)
                    
                # Get AI response for the transcribed text
                ai_response = self.get_ai_response(transcript, user)
                
                return {
                    'success': True,
                    'transcript': transcript,
                    'ai_response': ai_response
                }
                
        except Exception as e:
            current_app.logger.error(f"Error processing voice message: {str(e)}")
            return {
                'success': False,
                'error': 'Failed to process voice message'
            }
