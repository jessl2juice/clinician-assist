import openai
from flask import current_app
import os
from models import ChatMessage
from extensions import db
import traceback
from datetime import datetime
import io
import mimetypes

class ChatService:
    def __init__(self):
        self.client = openai.Client(api_key=os.environ.get('OPENAI_API_KEY'))
        
    def get_ai_response(self, user_message, user):
        try:
            current_app.logger.info("Generating AI response for user message")
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful therapist assistant. Provide supportive and professional responses while maintaining HIPAA compliance. Do not store or repeat sensitive personal information."},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=150
            )
            
            ai_message = response.choices[0].message.content
            current_app.logger.info("AI response generated successfully")
            
            chat_message = ChatMessage()
            chat_message.user_id = user.id
            chat_message.is_ai_response = True
            chat_message.content = ai_message
            
            db.session.add(chat_message)
            db.session.commit()
            current_app.logger.info("AI message saved to database")
            
            return ai_message
            
        except Exception as e:
            current_app.logger.error(f"Error getting AI response: {str(e)}\n{traceback.format_exc()}")
            return "I apologize, but I'm unable to process your request at the moment. Please try again later."

    def generate_audio_response(self, text):
        try:
            current_app.logger.info("Starting audio response generation")
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
            current_app.logger.info(f"Saving audio response to: {audio_path}")
            
            response.stream_to_file(audio_path)
            
            current_app.logger.info(f"Audio response generated and saved successfully: {filename}")
            return f'/static/voice_messages/{filename}'
                
        except Exception as e:
            current_app.logger.error(f"Error generating audio response: {str(e)}\n{traceback.format_exc()}")
            return None
            
    def process_voice_message(self, audio_file, user):
        temp_file = None
        try:
            current_app.logger.info(f"Starting voice message processing for user {user.id}")
            current_app.logger.info(f"Audio file info - filename: {audio_file.filename}, content_type: {audio_file.content_type}")
            
            # Read audio file bytes
            audio_bytes = audio_file.read()
            current_app.logger.info(f"Audio file read successfully, size: {len(audio_bytes)} bytes")
            
            if len(audio_bytes) == 0:
                raise ValueError("Empty audio file received")
            
            # Create a temporary file for OpenAI API
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            temp_filename = f'temp_voice_{timestamp}.webm'
            static_folder = current_app.static_folder or 'static'
            voice_messages_dir = os.path.join(static_folder, 'voice_messages')
            os.makedirs(voice_messages_dir, exist_ok=True)
            temp_file = os.path.join(voice_messages_dir, temp_filename)
            
            current_app.logger.info(f"Creating temporary file: {temp_file}")
            
            # Save audio bytes to temporary file
            with open(temp_file, 'wb') as f:
                f.write(audio_bytes)
            current_app.logger.info("Audio data written to temporary file successfully")
            
            # Process speech to text using the temporary file
            current_app.logger.info("Starting speech-to-text conversion")
            with open(temp_file, 'rb') as f:
                transcript = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    response_format="text"
                )
            
            if not transcript:
                raise ValueError("Failed to transcribe audio: Empty transcript received")
                
            current_app.logger.info(f"Speech to text completed successfully: {transcript}")
            
            # Save user message
            user_message = ChatMessage()
            user_message.user_id = user.id
            user_message.is_ai_response = False
            user_message.content = transcript
            db.session.add(user_message)
            db.session.commit()
            current_app.logger.info("User message saved to database")
            
            # Get AI response
            current_app.logger.info("Getting AI response")
            ai_response = self.get_ai_response(transcript, user)
            
            if not ai_response:
                raise ValueError("Failed to generate AI response")
            
            # Generate audio response
            current_app.logger.info("Generating audio response")
            audio_url = self.generate_audio_response(ai_response)
            
            if not audio_url:
                raise ValueError("Failed to generate audio response")
            
            current_app.logger.info("Voice message processing completed successfully")
            return {
                'success': True,
                'transcript': transcript,
                'ai_response': ai_response,
                'ai_audio_url': audio_url
            }
                
        except Exception as e:
            error_msg = f"Error processing voice message: {str(e)}\n{traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            # Cleanup temporary file
            try:
                if temp_file and os.path.exists(temp_file):
                    os.unlink(temp_file)
                    current_app.logger.info(f"Temporary file deleted: {temp_file}")
            except Exception as e:
                current_app.logger.error(f"Error cleaning up temporary file: {str(e)}")
