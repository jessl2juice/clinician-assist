import openai
from flask import current_app, request
import os
from models import ChatMessage
from extensions import db
import traceback
from datetime import datetime
import io
import uuid
import json

class ChatService:
    def __init__(self):
        self.api_key = os.environ.get('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OpenAI API key not found in environment variables")
        self.client = openai.Client(api_key=self.api_key)
        
    def get_ai_response(self, user_message, user):
        try:
            start_time = datetime.utcnow()
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful therapist assistant. Provide supportive and professional responses while maintaining HIPAA compliance. Do not store or repeat sensitive personal information."},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=150
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            current_app.logger.info(f"AI response generated in {processing_time:.2f} seconds")
            
            ai_message = response.choices[0].message.content
            
            chat_message = ChatMessage()
            chat_message.user_id = user.id
            chat_message.is_ai_response = True
            chat_message.content = ai_message
            
            db.session.add(chat_message)
            db.session.commit()
            
            return ai_message
            
        except openai.APIError as e:
            error_context = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'response_details': getattr(e, 'response', None),
                'user_id': user.id,
                'timestamp': datetime.utcnow().isoformat()
            }
            current_app.logger.error(f"OpenAI API Error: {json.dumps(error_context)}")
            return None
        except Exception as e:
            error_context = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': traceback.format_exc(),
                'user_id': user.id,
                'timestamp': datetime.utcnow().isoformat()
            }
            current_app.logger.error(f"Error getting AI response: {json.dumps(error_context)}")
            return None

    def generate_audio_response(self, text):
        try:
            if not text:
                raise ValueError("No text provided for audio generation")

            start_time = datetime.utcnow()
            current_app.logger.info("Generating audio response")
            
            response = self.client.audio.speech.create(
                model="tts-1",
                voice="alloy",
                input=text
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            current_app.logger.info(f"Audio generated in {processing_time:.2f} seconds")
            
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
                
                file_size = os.path.getsize(audio_path)
                current_app.logger.info(f"Audio file generated: {filename} ({file_size} bytes)")
                
            except Exception as e:
                error_context = {
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'traceback': traceback.format_exc(),
                    'timestamp': datetime.utcnow().isoformat()
                }
                current_app.logger.error(f"Error streaming audio to file: {json.dumps(error_context)}")
                if os.path.exists(audio_path):
                    os.remove(audio_path)
                return None
            
            return f'/static/voice_messages/{filename}'
                
        except Exception as e:
            error_context = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': traceback.format_exc(),
                'timestamp': datetime.utcnow().isoformat()
            }
            current_app.logger.error(f"Error generating audio response: {json.dumps(error_context)}")
            return None
            
    def process_voice_message(self, audio_file, user):
        temp_file = None
        start_time = datetime.utcnow()
        
        try:
            request_context = {
                'method': request.method,
                'path': request.path,
                'ip': request.remote_addr,
                'user_id': user.id,
                'content_type': audio_file.content_type if audio_file else None
            }
            current_app.logger.info(f"Processing voice message: {json.dumps(request_context)}")
            
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
                
            current_app.logger.info(f"Audio file received: {len(audio_bytes)} bytes")
            
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
            
            # Process speech to text using the temporary file
            try:
                with open(temp_file, 'rb') as f:
                    transcript = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=f,
                        response_format="text"
                    )
            except openai.APIError as e:
                error_context = {
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'response_details': getattr(e, 'response', None),
                    'user_id': user.id,
                    'timestamp': datetime.utcnow().isoformat()
                }
                current_app.logger.error(f"OpenAI API Error during transcription: {json.dumps(error_context)}")
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
            ai_response = self.get_ai_response(transcript, user)
            
            if not ai_response:
                raise ValueError("Failed to get AI response")
            
            # Generate audio response
            audio_url = self.generate_audio_response(ai_response)
            
            if not audio_url:
                raise ValueError("Failed to generate audio response")
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            current_app.logger.info(f"Voice message processed in {processing_time:.2f} seconds")
            
            return {
                'success': True,
                'transcript': transcript,
                'ai_response': ai_response,
                'ai_audio_url': audio_url
            }
                
        except ValueError as e:
            error_context = {
                'error_type': 'ValueError',
                'error_message': str(e),
                'traceback': traceback.format_exc(),
                'user_id': user.id,
                'timestamp': datetime.utcnow().isoformat()
            }
            current_app.logger.error(f"Validation error: {json.dumps(error_context)}")
            return {
                'success': False,
                'error': str(e)
            }
        except Exception as e:
            error_context = {
                'error_type': type(e).__name__,
                'error_message': str(e),
                'traceback': traceback.format_exc(),
                'user_id': user.id,
                'request_method': request.method,
                'request_path': request.path,
                'remote_addr': request.remote_addr,
                'timestamp': datetime.utcnow().isoformat()
            }
            current_app.logger.error(f"Error processing voice message: {json.dumps(error_context)}")
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
                error_context = {
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'file_path': temp_file,
                    'timestamp': datetime.utcnow().isoformat()
                }
                current_app.logger.error(f"Error cleaning up temporary file: {json.dumps(error_context)}")
