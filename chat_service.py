import openai
from flask import current_app
import os
from models import ChatMessage, AuditLog
from extensions import db
import json
import traceback
from datetime import datetime

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
            
            # Get AI response
            ai_message = response.choices[0].message.content
            
            # Create and save the AI response
            chat_message = ChatMessage()
            chat_message.user_id = user.id
            chat_message.is_ai_response = True
            chat_message.content = ai_message
            
            db.session.add(chat_message)
            
            # Log the interaction (maintaining audit trail)
            audit_log = AuditLog()
            audit_log.user_id = user.id
            audit_log.action = 'ai_chat_response'
            audit_log.details = json.dumps({'message_id': chat_message.id})
            
            db.session.add(audit_log)
            db.session.commit()
            
            return ai_message
            
        except Exception as e:
            current_app.logger.error(f"Error getting AI response: {str(e)}\n{traceback.format_exc()}")
            return "I apologize, but I'm unable to process your request at the moment. Please try again later."

    def generate_audio_response(self, text):
        try:
            current_app.logger.info("Generating audio response")
            
            # Generate speech using OpenAI TTS API
            response = self.client.audio.speech.create(
                model="tts-1",
                voice="alloy",
                input=text
            )
            
            # Save the audio response
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f'ai_response_{timestamp}.mp3'
            audio_path = os.path.join(current_app.static_folder, 'voice_messages', filename)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(audio_path), exist_ok=True)
            
            # Save the audio file
            response.stream_to_file(audio_path)
            
            return f'voice_messages/{filename}'
            
        except Exception as e:
            current_app.logger.error(f"Error generating audio response: {str(e)}\n{traceback.format_exc()}")
            return None
            
    def process_voice_message(self, audio_data, user):
        try:
            current_app.logger.info("Starting voice message processing")
            
            # Create a temporary file for the audio data
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            temp_filename = f'temp_voice_{timestamp}.wav'
            temp_path = os.path.join(current_app.static_folder, 'voice_messages', temp_filename)
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)
            
            # Save the audio data temporarily
            with open(temp_path, 'wb') as f:
                f.write(audio_data)
            
            try:
                # Use OpenAI's Audio API for speech-to-text
                with open(temp_path, 'rb') as audio_file:
                    transcript = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file
                    )
                    
                current_app.logger.info(f"Speech recognition successful: {transcript.text}")
                
                # Save user message
                user_message = ChatMessage()
                user_message.user_id = user.id
                user_message.is_ai_response = False
                user_message.content = transcript.text
                db.session.add(user_message)
                db.session.commit()
                
                # Get AI response for the transcribed text
                current_app.logger.info("Getting AI response")
                ai_response = self.get_ai_response(transcript.text, user)
                
                # Generate audio response
                current_app.logger.info("Generating audio response")
                audio_file_path = self.generate_audio_response(ai_response)
                
                return {
                    'success': True,
                    'transcript': transcript.text,
                    'ai_response': ai_response,
                    'ai_audio_url': audio_file_path
                }
                
            finally:
                # Cleanup temporary file
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    current_app.logger.error(f"Error cleaning up temporary file: {str(e)}")
                
        except Exception as e:
            current_app.logger.error(f"Error processing voice message: {str(e)}\n{traceback.format_exc()}")
            return {
                'success': False,
                'error': str(e) if str(e) != '' else 'Failed to process voice message'
            }
