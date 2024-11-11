document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordingStatus = document.getElementById('recordingStatus');
    const statusText = recordingStatus.querySelector('.status-text');
    const recordingTime = recordingStatus.querySelector('.recording-time');
    const voiceMessages = document.getElementById('voice-messages');
    
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let startTime;
    let currentlyPlaying = null;
    
    // Request microphone access
    async function setupRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            statusText.textContent = 'Error: Microphone access denied';
            return false;
        }
    }
    
    // Update recording time
    function updateRecordingTime() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        recordingTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Start recording
    async function startRecording() {
        if (!mediaRecorder) {
            const setup = await setupRecording();
            if (!setup) return;
        }
        
        mediaRecorder.start();
        startTime = Date.now();
        recordButton.classList.add('recording');
        statusText.textContent = 'Recording in progress...';
        recordingTimer = setInterval(updateRecordingTime, 1000);
    }
    
    // Stop recording
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordingTimer);
            recordButton.classList.remove('recording');
            statusText.textContent = 'Processing your message...';
            recordingTime.textContent = '';
        }
    }
    
    // Stop currently playing audio
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
    
    // Play audio with visual feedback
    function playAudio(audio, playPauseBtn) {
        if (currentlyPlaying && currentlyPlaying !== audio) {
            stopCurrentAudio();
        }
        
        if (audio.paused) {
            audio.play();
            playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
            currentlyPlaying = audio;
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
        }
    }
    
    // Add voice message to chat
    function addVoiceMessage(audioUrl, content, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'}`;
        
        let messageContent = '';
        
        // Add transcript first for AI messages
        if (isAI) {
            messageContent += `<div class="voice-transcript">${content}</div>`;
        }
        
        // Add audio player if URL is provided
        if (audioUrl) {
            messageContent += `
                <div class="audio-player-wrapper">
                    <audio src="${audioUrl}"></audio>
                    <div class="audio-controls">
                        <button class="btn btn-sm btn-${isAI ? 'secondary' : 'primary'} play-pause-btn">
                            <i class="bi bi-play-fill"></i>
                        </button>
                        <div class="audio-progress">
                            <div class="progress-bar"></div>
                        </div>
                    </div>
                </div>`;
        }
        
        // Add transcript last for user messages
        if (!isAI) {
            messageContent += `<div class="voice-transcript">${content}</div>`;
        }
        
        messageDiv.innerHTML = `
            <div class="voice-message-content">
                ${messageContent}
            </div>
            <div class="voice-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        
        // Setup audio controls if there's an audio element
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
    
    // Send voice message to server
    function sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.wav');
        
        statusText.textContent = 'Processing message...';
        
        fetch('/voice-message', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Add user's voice message
                addVoiceMessage(null, data.transcript, false);
                
                // Add AI's response with both text and audio
                if (data.ai_response) {
                    addVoiceMessage(data.ai_audio_url, data.ai_response, true);
                }
                
                statusText.textContent = 'Hold to Talk';
            } else {
                statusText.textContent = data.error || 'Error processing voice message';
                setTimeout(() => {
                    statusText.textContent = 'Hold to Talk';
                }, 3000);
            }
        })
        .catch(error => {
            console.error('Error sending voice message:', error);
            statusText.textContent = 'Error sending voice message';
            setTimeout(() => {
                statusText.textContent = 'Hold to Talk';
            }, 3000);
        });
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
        statusText.textContent = 'Hold to Talk';
    });
});
