document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = document.querySelector('.record-text');
    const voiceMessages = document.getElementById('voice-messages');
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let startTime;
    let audioElements = new Map();
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
                const duration = (Date.now() - startTime) / 1000;
                if (duration < 0.5) {
                    recordButtonText.textContent = 'Message too short. Hold longer to speak.';
                    setTimeout(() => {
                        recordButtonText.textContent = 'Press and Hold to Speak';
                    }, 2000);
                    return;
                }

                if (audioChunks.length === 0) {
                    console.error('No audio data recorded');
                    return;
                }

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                if (audioBlob.size < 1000) {
                    console.error('Audio data too small');
                    return;
                }

                await sendVoiceMessage(audioBlob);
            };
            
            return true;
        } catch (err) {
            console.error('Setup recording error:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            handleRecordingError(err);
            return false;
        }
    }
    
    function handleRecordingError(error) {
        console.error('Recording error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
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
        if (mediaRecorder?.state === 'recording') return;
        
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
            console.error('Start recording error:', err);
            handleRecordingError(err);
        }
    }
    
    function stopRecording() {
        try {
            if (mediaRecorder?.state === 'recording') {
                clearInterval(recordingTimer);
                recordButton.classList.remove('recording');
                mediaRecorder.stop();
            }
        } catch (err) {
            console.error('Stop recording error:', err);
            handleRecordingError(err);
        }
    }
    
    async function sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice_message.webm');
        
        try {
            recordButtonText.textContent = 'Sending message...';
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData
            });
            
            const responseText = await response.text();
            let data;
            
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('Error parsing response:', {
                    responseText,
                    error: e.message
                });
                throw new Error('Invalid server response');
            }
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} - ${data.error || responseText}`);
            }
            
            if (data.success) {
                retryCount = 0;
                if (data.ai_audio_url) {
                    addVoiceMessage(data.ai_audio_url);
                }
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }
        } catch (error) {
            console.error('Error sending voice message:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });

            if (retryCount < MAX_RETRIES) {
                retryCount++;
                recordButtonText.textContent = `Retrying... (${retryCount}/${MAX_RETRIES})`;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return sendVoiceMessage(audioBlob);
            }

            recordButtonText.textContent = 'Error sending message. Please try again.';
        } finally {
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
            }, 3000);
        }
    }
    
    function stopAllAudio() {
        audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        audioElements.clear();
    }
    
    function addVoiceMessage(audioUrl) {
        if (!audioUrl) return;
        
        const audio = new Audio(audioUrl);
        const messageId = Date.now().toString();
        audioElements.set(messageId, audio);
        
        audio.addEventListener('ended', () => {
            audioElements.delete(messageId);
        });
        
        // Auto-play AI responses
        audio.addEventListener('canplaythrough', () => {
            stopAllAudio();
            audio.play().catch(err => {
                console.error('Error playing audio:', {
                    name: err.name,
                    message: err.message,
                    stack: err.stack
                });
            });
        }, { once: true });
    }
    
    // Setup event listeners
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
