document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = document.querySelector('.record-text');
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let startTime;
    let currentlyPlaying = null;
    
    async function setupRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });
            
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks);
                await sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            recordButtonText.textContent = 'Microphone access denied';
            return false;
        }
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
        
        mediaRecorder.start(100);
        startTime = Date.now();
        recordButton.classList.add('recording');
        recordButtonText.textContent = 'Recording...';
        recordingTimer = setInterval(updateRecordingTime, 1000);
    }
    
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordingTimer);
            recordButton.classList.remove('recording');
            recordButtonText.textContent = 'Processing...';
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
                    console.error('Error playing audio:', err);
                    recordButtonText.textContent = 'Error playing audio';
                    setTimeout(() => {
                        recordButtonText.textContent = 'Press and Hold to Speak';
                    }, 3000);
                });
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
        }
    }
    
    function addVoiceMessage(audioUrl, transcript, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'}`;
        
        let messageContent = '';
        
        // Add audio player if there's an audio URL
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
        
        // Add transcript if available
        if (transcript) {
            messageContent += `
                <div class="voice-transcript">
                    ${transcript}
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
                
                // Auto-play AI responses
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
    
    async function sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob);
        
        try {
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Add user's message
                addVoiceMessage(null, data.transcript, false);
                
                // Add AI's response
                if (data.ai_audio_url) {
                    addVoiceMessage(data.ai_audio_url, data.ai_response, true);
                }
                
                recordButtonText.textContent = 'Press and Hold to Speak';
            } else {
                console.error('Error processing voice message:', data.error);
                recordButtonText.textContent = data.error || 'Error processing message';
                setTimeout(() => {
                    recordButtonText.textContent = 'Press and Hold to Speak';
                }, 3000);
            }
        } catch (error) {
            console.error('Error sending voice message:', error);
            recordButtonText.textContent = 'Error sending message';
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
            }, 3000);
        }
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
