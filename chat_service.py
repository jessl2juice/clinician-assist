import openai
from flask import current_app
import os
from models import ChatMessage
from extensions import db
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
            
            ai_message = response.choices[0].message.content
            
            chat_message = ChatMessage()
            chat_message.user_id = user.id
            chat_message.is_ai_response = True
            chat_message.content = ai_message
            
            db.session.add(chat_message)
            db.session.commit()
            
            return ai_message
            
        except Exception as e:
            current_app.logger.error(f"Error getting AI response: {str(e)}")
            return "I apologize, but I'm unable to process your request at the moment. Please try again later."

    def generate_audio_response(self, text):
        try:
            current_app.logger.info("Generating audio response")
            response = self.client.audio.speech.create(
                model="tts-1",
                voice="alloy",
                input=text
            )
            
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f'ai_response_{timestamp}.mp3'
            
            static_folder = current_app.static_folder or 'static'
            voice_messages_dir = os.path.join(static_folder, 'voice_messages')
            os.makedirs(voice_messages_dir, exist_ok=True)
            
            audio_path = os.path.join(voice_messages_dir, filename)
            response.stream_to_file(audio_path)
            
            current_app.logger.info(f"Audio response generated successfully: {filename}")
            return f'/static/voice_messages/{filename}'
                
        except Exception as e:
            current_app.logger.error(f"Error generating audio response: {str(e)}")
            return None
            
    def process_voice_message(self, audio_file, user):
        try:
            current_app.logger.info("Processing voice message")
            
            # Process speech to text directly
            transcript = self.client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
            
            current_app.logger.info(f"Speech to text completed: {transcript.text}")
            
            # Save user message
            user_message = ChatMessage()
            user_message.user_id = user.id
            user_message.is_ai_response = False
            user_message.content = transcript.text
            db.session.add(user_message)
            db.session.commit()
            
            # Get AI response
            current_app.logger.info("Getting AI response")
            ai_response = self.get_ai_response(transcript.text, user)
            
            # Generate audio response
            current_app.logger.info("Generating audio response")
            audio_url = self.generate_audio_response(ai_response)
            
            if not audio_url:
                return {
                    'success': False,
                    'error': 'Failed to generate audio response'
                }
            
            return {
                'success': True,
                'transcript': transcript.text,
                'ai_response': ai_response,
                'ai_audio_url': audio_url
            }
                
        except Exception as e:
            error_msg = f"Error processing voice message: {str(e)}\n{traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return {
                'success': False,
                'error': 'Failed to process voice message'
            }