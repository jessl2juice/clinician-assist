document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = document.querySelector('.record-text');
    const voiceMessages = document.getElementById('voice-messages');
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let startTime;
    let currentlyPlaying = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    
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
        if (!mediaRecorder) {
            const setup = await setupRecording();
            if (!setup) return;
        }
        
        try {
            audioChunks = []; // Clear any previous chunks
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
            
            const responseData = await response.text();
            let data;
            try {
                data = JSON.parse(responseData);
            } catch (e) {
                console.error('Error parsing response:', responseData);
                throw new Error('Invalid server response');
            }
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} - ${data.error || responseData}`);
            }
            
            if (data.success) {
                retryCount = 0; // Reset retry count on success
                
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
                retryCount: retryCount
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
                retryCount = 0; // Reset retry count after error
            }, 3000);
        }
    }
    
    function stopCurrentAudio() {
        if (currentlyPlaying) {
            currentlyPlaying.pause();
            currentlyPlaying.currentTime = 0;
            const playButton = currentlyPlaying.parentElement.querySelector('.play-pause-btn');
            if (playButton) {
                playButton.innerHTML = '<i class="bi bi-play-fill"></i>';
            }
            currentlyPlaying = null;
        }
    }
    
    function playAudio(audio, playPauseBtn) {
        if (currentlyPlaying && currentlyPlaying !== audio) {
            stopCurrentAudio();
        }
        
        if (audio.paused) {
            audio.play()
                .then(() => {
                    playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                    currentlyPlaying = audio;
                })
                .catch(err => {
                    console.error('Error playing audio:', {
                        name: err.name,
                        message: err.message,
                        stack: err.stack
                    });
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                });
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
        }
    }
    
    function addVoiceMessage(audioUrl, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'} message-appear`;
        
        let messageContent = '';
        
        if (audioUrl) {
            messageContent += `
                <div class="audio-player-wrapper">
                    <audio src="${audioUrl}"></audio>
                    <div class="audio-controls">
                        <button class="btn btn-sm btn-${isAI ? 'secondary' : 'primary'} play-pause-btn">
                            <i class="bi bi-play-fill"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        
        messageContent += `
            <div class="voice-message-timestamp">
                ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        `;
        
        messageDiv.innerHTML = messageContent;
        
        if (audioUrl) {
            const audio = messageDiv.querySelector('audio');
            const playPauseBtn = messageDiv.querySelector('.play-pause-btn');
            
            if (audio && playPauseBtn) {
                playPauseBtn.addEventListener('click', () => playAudio(audio, playPauseBtn));
                
                audio.addEventListener('ended', () => {
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    currentlyPlaying = null;
                });
                
                if (isAI) {
                    audio.addEventListener('canplaythrough', () => {
                        if (!currentlyPlaying) {
                            playAudio(audio, playPauseBtn);
                        }
                    }, { once: true });
                }
            }
        }
        
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
