import openai
from flask import current_app, request
import os
from models import ChatMessage
from extensions import db
import traceback
from datetime import datetime
import io
import uuid

class ChatService:
    def __init__(self):
        self.api_key = os.environ.get('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OpenAI API key not found in environment variables")
        self.client = openai.Client(api_key=self.api_key)
        
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
            
        except openai.APIError as e:
            error_msg = f"OpenAI API Error: {str(e)}\nType: {type(e).__name__}\nDetails: {getattr(e, 'response', None)}"
            current_app.logger.error(error_msg)
            return None
        except Exception as e:
            error_msg = f"Error getting AI response: {str(e)}\nType: {type(e).__name__}\nTraceback: {traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return None

    def generate_audio_response(self, text):
        try:
            if not text:
                raise ValueError("No text provided for audio generation")

            current_app.logger.info("Generating audio response")
            response = self.client.audio.speech.create(
                model="tts-1",
                voice="alloy",
                input=text
            )
            
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            unique_id = str(uuid.uuid4())[:8]
            filename = f'ai_response_{timestamp}_{unique_id}.mp3'
            
            static_folder = current_app.static_folder or 'static'
            voice_messages_dir = os.path.join(static_folder, 'voice_messages')
            os.makedirs(voice_messages_dir, exist_ok=True)
            
            audio_path = os.path.join(voice_messages_dir, filename)
            
            try:
                response.stream_to_file(audio_path)
                if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                    raise ValueError("Failed to generate audio file")
            except Exception as e:
                error_msg = f"Error streaming audio to file: {str(e)}\nType: {type(e).__name__}\nTraceback: {traceback.format_exc()}"
                current_app.logger.error(error_msg)
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                return None
            
            current_app.logger.info(f"Audio response generated successfully: {filename}")
            return f'/static/voice_messages/{filename}'
                
        except Exception as e:
            error_msg = f"Error generating audio response: {str(e)}\nType: {type(e).__name__}\nTraceback: {traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return None
            
    def process_voice_message(self, audio_file, user):
        temp_file = None
        try:
            current_app.logger.info(f"Processing voice message for user: {user.id}")
            current_app.logger.info(f"Request context: Method={request.method}, Path={request.path}, IP={request.remote_addr}")
            
            if not audio_file or not audio_file.content_type:
                raise ValueError("Invalid audio file")
            
            if 'audio/webm' not in audio_file.content_type:
                raise ValueError(f"Unsupported audio format: {audio_file.content_type}. Only WebM audio is supported.")
            
            # Read audio file bytes
            audio_bytes = audio_file.read()
            if not audio_bytes:
                raise ValueError("Empty audio file")
            
            if len(audio_bytes) < 100:  # Basic size check
                raise ValueError("Audio file too small, please record a longer message")
                
            current_app.logger.info(f"Audio file read, size: {len(audio_bytes)} bytes")
            
            # Create a temporary file with unique name
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            unique_id = str(uuid.uuid4())[:8]
            temp_filename = f'temp_voice_{timestamp}_{unique_id}.webm'
            static_folder = current_app.static_folder or 'static'
            voice_messages_dir = os.path.join(static_folder, 'voice_messages')
            os.makedirs(voice_messages_dir, exist_ok=True)
            temp_file = os.path.join(voice_messages_dir, temp_filename)
            
            # Save audio bytes to temporary file
            with open(temp_file, 'wb') as f:
                f.write(audio_bytes)
            current_app.logger.info(f"Temporary file created: {temp_file}")
            
            # Process speech to text using the temporary file
            try:
                with open(temp_file, 'rb') as f:
                    transcript = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=f,
                        response_format="text"
                    )
            except openai.APIError as e:
                error_msg = f"OpenAI API Error during transcription: {str(e)}\nType: {type(e).__name__}\nDetails: {getattr(e, 'response', None)}"
                current_app.logger.error(error_msg)
                raise ValueError("Failed to transcribe audio: OpenAI API error")
            
            if not transcript:
                raise ValueError("Failed to transcribe audio: Empty response")
                
            current_app.logger.info(f"Speech to text completed: {transcript}")
            
            # Save user message
            user_message = ChatMessage()
            user_message.user_id = user.id
            user_message.is_ai_response = False
            user_message.content = transcript
            db.session.add(user_message)
            db.session.commit()
            
            # Get AI response
            current_app.logger.info("Getting AI response")
            ai_response = self.get_ai_response(transcript, user)
            
            if not ai_response:
                raise ValueError("Failed to get AI response: OpenAI API error")
            
            # Generate audio response
            current_app.logger.info("Generating audio response")
            audio_url = self.generate_audio_response(ai_response)
            
            if not audio_url:
                raise ValueError("Failed to generate audio response")
            
            return {
                'success': True,
                'transcript': transcript,
                'ai_response': ai_response,
                'ai_audio_url': audio_url
            }
                
        except ValueError as e:
            error_msg = f"Validation error: {str(e)}\nType: {type(e).__name__}\nTraceback: {traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return {
                'success': False,
                'error': str(e)
            }
        except Exception as e:
            error_context = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'user_id': getattr(user, 'id', None),
                'request_method': request.method,
                'request_path': request.path,
                'remote_addr': request.remote_addr
            }
            error_msg = f"Error processing voice message:\nContext: {error_context}\nTraceback: {traceback.format_exc()}"
            current_app.logger.error(error_msg)
            return {
                'success': False,
                'error': f"Error processing voice message: {type(e).__name__} - {str(e)}"
            }
        finally:
            # Cleanup temporary file
            try:
                if temp_file and os.path.exists(temp_file):
                    os.unlink(temp_file)
                    current_app.logger.info(f"Temporary file deleted: {temp_file}")
            except Exception as e:
                current_app.logger.error(f"Error cleaning up temporary file: {str(e)}")
