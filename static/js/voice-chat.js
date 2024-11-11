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
    
    function scrollToBottom(container) {
        if (!container) return;
        const shouldScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
        
        if (shouldScroll) {
            container.scrollTop = container.scrollHeight;
            container.style.scrollBehavior = 'smooth';
        }
    }
    
    async function setupRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });
            
            const mimeType = 'audio/webm';
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 16000
            });
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                if (audioChunks.length === 0) {
                    showStatus('No audio recorded', 2000);
                    return;
                }
                
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                if (audioBlob.size === 0) {
                    showStatus('No audio recorded', 2000);
                    return;
                }
                
                await sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            showStatus('Error: ' + (err.message || 'Microphone access denied'), 3000);
            return false;
        }
    }
    
    function showStatus(message, duration = 2000) {
        if (!statusText) return;
        statusText.textContent = message;
        if (duration > 0) {
            setTimeout(() => {
                if (statusText) {
                    statusText.textContent = 'Hold to Talk';
                }
            }, duration);
        }
    }
    
    function updateRecordingTime() {
        if (!recordingTime) return;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        recordingTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    async function startRecording() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            const setup = await setupRecording();
            if (!setup) return;
        }
        
        try {
            mediaRecorder.start(100);
            startTime = Date.now();
            recordButton.classList.add('recording');
            showStatus('Recording...', 0);
            recordingTime.textContent = '0:00';
            recordingTimer = setInterval(updateRecordingTime, 1000);
        } catch (err) {
            console.error('Error starting recording:', err);
            showStatus('Error starting recording', 2000);
        }
    }
    
    function stopRecording() {
        try {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                clearInterval(recordingTimer);
                recordButton.classList.remove('recording');
                showStatus('Processing...', 0);
                recordingTime.textContent = '';
            }
        } catch (err) {
            console.error('Error stopping recording:', err);
            showStatus('Error stopping recording', 2000);
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
        if (!audio || !playPauseBtn) return;
        
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
                    currentlyPlaying = null;
                    showStatus('Error playing audio', 2000);
                });
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
        }
    }
    
    function addVoiceMessage(audioUrl, transcript, isAI) {
        if (!voiceMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'} message-appear`;
        
        let messageContent = '';
        
        if (audioUrl) {
            messageContent += `
                <div class="audio-player-wrapper">
                    <audio src="${audioUrl}" preload="auto"></audio>
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
        scrollToBottom(voiceMessages);
    }
    
    async function sendVoiceMessage(audioBlob) {
        if (!audioBlob || audioBlob.size === 0) {
            showStatus('No audio to send', 2000);
            return;
        }
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        
        showStatus('Processing...', 0);
        
        try {
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                if (data.transcript) {
                    addVoiceMessage(null, data.transcript, false);
                }
                
                if (data.ai_audio_url && data.ai_response) {
                    addVoiceMessage(data.ai_audio_url, data.ai_response, true);
                }
                
                showStatus('Hold to Talk', 0);
            } else {
                throw new Error(data.error || 'Failed to process message');
            }
        } catch (error) {
            console.error('Error sending voice message:', error);
            showStatus('Error: ' + (error.message || 'Failed to send message'), 3000);
            
            // Add error message to chat
            addVoiceMessage(null, 'Error: Failed to send voice message. Please try again.', true);
        }
    }
    
    // Event Listeners
    if (recordButton) {
        recordButton.addEventListener('mousedown', startRecording);
        recordButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startRecording();
        });
        
        recordButton.addEventListener('mouseup', stopRecording);
        recordButton.addEventListener('mouseleave', stopRecording);
        recordButton.addEventListener('touchend', stopRecording);
        recordButton.addEventListener('touchcancel', stopRecording);
    }
    
    // Add scroll event listener to handle new messages
    if (voiceMessages) {
        voiceMessages.addEventListener('scroll', function() {
            voiceMessages.style.scrollBehavior = 'auto';
        });
        
        // Observe voice messages for changes
        const observer = new MutationObserver(() => scrollToBottom(voiceMessages));
        observer.observe(voiceMessages, { childList: true, subtree: true });
    }
    
    // Initial setup
    if (recordButton) {
        setupRecording().then(() => {
            showStatus('Hold to Talk', 0);
        });
    }
});
