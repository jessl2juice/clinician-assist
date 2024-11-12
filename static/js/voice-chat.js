document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = document.querySelector('.record-text');
    const voiceMessages = document.getElementById('voice-messages');
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let startTime;
    let audioElements = new Map(); // Store audio elements for playback control
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    
    async function setupRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });
            
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                if (audioChunks.length === 0) {
                    const error = new Error('No audio data recorded');
                    handleRecordingError(error);
                    return;
                }

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                if (audioBlob.size === 0) {
                    const error = new Error('Empty audio blob created');
                    handleRecordingError(error);
                    return;
                }

                await sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            return true;
        } catch (err) {
            handleRecordingError(err);
            return false;
        }
    }
    
    function handleRecordingError(error) {
        console.error('Recording error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        let userMessage = 'An error occurred while recording';
        if (error.name === 'NotAllowedError') {
            userMessage = 'Microphone access denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError') {
            userMessage = 'No microphone found. Please connect a microphone and try again.';
        }
        
        recordButtonText.textContent = userMessage;
        setTimeout(() => {
            recordButtonText.textContent = 'Press and Hold to Speak';
        }, 3000);
    }
    
    function updateRecordingTime() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        recordButtonText.textContent = `Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    async function startRecording() {
        if (!mediaRecorder) {
            const setup = await setupRecording();
            if (!setup) return;
        }
        
        try {
            audioChunks = [];
            mediaRecorder.start(100);
            startTime = Date.now();
            recordButton.classList.add('recording');
            recordButtonText.textContent = 'Recording...';
            recordingTimer = setInterval(updateRecordingTime, 1000);
        } catch (err) {
            handleRecordingError(err);
        }
    }
    
    function stopRecording() {
        try {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                clearInterval(recordingTimer);
                recordButton.classList.remove('recording');
                recordButtonText.textContent = 'Processing...';
                mediaRecorder.stop();
            }
        } catch (err) {
            handleRecordingError(err);
        }
    }
    
    async function sendVoiceMessage(audioBlob, isRetry = false) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice_message.webm');
        
        try {
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData
            });
            
            let data;
            const responseText = await response.text();
            
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('Error parsing response:', {
                    responseText,
                    error: e,
                    timestamp: new Date().toISOString()
                });
                throw new Error('Invalid server response');
            }
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} - ${data.error || responseText}`);
            }
            
            if (data.success) {
                retryCount = 0;
                if (data.ai_audio_url) {
                    addVoiceMessage(data.ai_audio_url, true);
                }
                recordButtonText.textContent = 'Press and Hold to Speak';
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }
        } catch (error) {
            console.error('Error sending voice message:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                retry: isRetry,
                retryCount,
                timestamp: new Date().toISOString()
            });

            if (!isRetry && retryCount < MAX_RETRIES) {
                retryCount++;
                recordButtonText.textContent = `Retrying... (${retryCount}/${MAX_RETRIES})`;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return sendVoiceMessage(audioBlob, true);
            }

            let userMessage = 'Error processing voice message. Please try again.';
            if (error.message.includes('OpenAI API')) {
                userMessage = 'AI service temporarily unavailable. Please try again later.';
            } else if (error.message.includes('audio format')) {
                userMessage = 'Unsupported audio format. Please try again.';
            }

            recordButtonText.textContent = userMessage;
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
                retryCount = 0;
            }, 3000);
        }
    }
    
    function stopAllAudio() {
        audioElements.forEach((audio) => {
            audio.pause();
            audio.currentTime = 0;
        });
    }
    
    function addVoiceMessage(audioUrl, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'} message-appear`;
        
        // Create hidden audio element
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            const messageId = `message-${Date.now()}`;
            audioElements.set(messageId, audio);
            
            audio.addEventListener('ended', () => {
                audioElements.delete(messageId);
            });
            
            // Auto-play AI responses
            if (isAI) {
                audio.addEventListener('canplaythrough', () => {
                    stopAllAudio();
                    audio.play().catch(err => {
                        console.error('Error auto-playing audio:', {
                            name: err.name,
                            message: err.message,
                            stack: err.stack
                        });
                    });
                }, { once: true });
            }
        }
        
        messageDiv.innerHTML = `
            <div class="voice-message-timestamp">
                ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        `;
        
        voiceMessages.appendChild(messageDiv);
        voiceMessages.scrollTop = voiceMessages.scrollHeight;
    }
    
    // Setup event listeners for push-to-talk
    recordButton.addEventListener('mousedown', startRecording);
    recordButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    
    recordButton.addEventListener('mouseup', stopRecording);
    recordButton.addEventListener('mouseleave', stopRecording);
    recordButton.addEventListener('touchend', stopRecording);
    recordButton.addEventListener('touchcancel', stopRecording);
    
    // Initial setup
    setupRecording().then(() => {
        recordButtonText.textContent = 'Press and Hold to Speak';
    });
});