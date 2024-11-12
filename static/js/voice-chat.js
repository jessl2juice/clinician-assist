document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordButtonText = document.querySelector('.record-text');
    const voiceMessages = document.getElementById('voice-messages');
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
                    console.error('No audio data recorded');
                    recordButtonText.textContent = 'No audio recorded, try again';
                    setTimeout(() => {
                        recordButtonText.textContent = 'Press and Hold to Speak';
                    }, 3000);
                    return;
                }

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                if (audioBlob.size === 0) {
                    console.error('Empty audio blob created');
                    recordButtonText.textContent = 'Recording failed, try again';
                    setTimeout(() => {
                        recordButtonText.textContent = 'Press and Hold to Speak';
                    }, 3000);
                    return;
                }

                await sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            recordButtonText.textContent = err.message || 'Microphone access denied';
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
            }, 3000);
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
        
        try {
            audioChunks = []; // Clear any previous chunks
            mediaRecorder.start(100);
            startTime = Date.now();
            recordButton.classList.add('recording');
            recordButtonText.textContent = 'Recording...';
            recordingTimer = setInterval(updateRecordingTime, 1000);
        } catch (err) {
            console.error('Error starting recording:', err);
            recordButtonText.textContent = err.message || 'Error starting recording';
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
            }, 3000);
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
            console.error('Error stopping recording:', err);
            recordButtonText.textContent = err.message || 'Error stopping recording';
            setTimeout(() => {
                recordButtonText.textContent = 'Press and Hold to Speak';
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
                    console.error('Error playing audio:', err);
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                });
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
        }
    }
    
    function addVoiceMessage(audioUrl, transcript, isAI) {
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
        formData.append('audio', audioBlob, 'voice_message.webm');
        
        try {
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                if (data.transcript) {
                    addVoiceMessage(null, data.transcript, false);
                }
                
                if (data.ai_audio_url) {
                    addVoiceMessage(data.ai_audio_url, data.ai_response, true);
                }
                
                recordButtonText.textContent = 'Press and Hold to Speak';
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }
        } catch (error) {
            console.error('Error sending voice message:', error);
            recordButtonText.textContent = error.message || 'Error sending message';
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
