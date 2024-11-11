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
    let scrollTimeout;
    
    function scrollToBottom(container) {
        if (!container) return;
        
        // Clear any existing scroll timeout
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        // Set a new timeout to scroll after content is rendered
        scrollTimeout = setTimeout(() => {
            container.scrollTop = container.scrollHeight;
            container.style.scrollBehavior = 'smooth';
        }, 100);
    }
    
    // Add scroll observer
    function observeScroll(container) {
        if (!container) return;
        
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        scrollToBottom(container);
                    }
                });
            },
            { root: container, threshold: 0.5 }
        );
        
        // Observe all messages
        container.querySelectorAll('.voice-message').forEach(message => {
            observer.observe(message);
        });
        
        return observer;
    }
    
    async function setupRecording() {
        showStatus('Initializing microphone...', 0);
        try {
            console.log('Setting up recording...');
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
                console.log('Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                console.log('Recording stopped. Processing audio...');
                if (audioChunks.length === 0) {
                    console.error('No audio chunks recorded');
                    showStatus('No audio recorded', 2000);
                    return;
                }
                
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                console.log('Audio blob created, size:', audioBlob.size, 'bytes');
                
                if (audioBlob.size === 0) {
                    console.error('Empty audio blob created');
                    showStatus('No audio recorded', 2000);
                    return;
                }
                
                await sendVoiceMessage(audioBlob);
                audioChunks = [];
            };
            
            console.log('Recording setup completed successfully');
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            console.error('Error details:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            showStatus('Error: ' + (err.message || 'Microphone access denied'), 3000);
            return false;
        }
    }
    
    function showStatus(message, duration = 2000) {
        console.log('Status update:', message);
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
        console.log('Starting recording...');
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            showStatus('Setting up recorder...', 0);
            const setup = await setupRecording();
            if (!setup) {
                console.error('Failed to setup recording');
                return;
            }
        }
        
        try {
            mediaRecorder.start(100);
            console.log('Recording started');
            startTime = Date.now();
            recordButton.classList.add('recording');
            showStatus('Recording...', 0);
            recordingTime.textContent = '0:00';
            recordingTimer = setInterval(updateRecordingTime, 1000);
        } catch (err) {
            console.error('Error starting recording:', err);
            console.error('Error details:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            showStatus('Error starting recording', 2000);
        }
    }
    
    function stopRecording() {
        console.log('Stopping recording...');
        try {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                clearInterval(recordingTimer);
                recordButton.classList.remove('recording');
                showStatus('Processing...', 0);
                recordingTime.textContent = '';
                console.log('Recording stopped successfully');
            }
        } catch (err) {
            console.error('Error stopping recording:', err);
            console.error('Error details:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
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
                    console.log('Audio playback started');
                })
                .catch(err => {
                    console.error('Error playing audio:', err);
                    console.error('Error details:', {
                        name: err.name,
                        message: err.message,
                        stack: err.stack
                    });
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    currentlyPlaying = null;
                    showStatus('Error playing audio', 2000);
                });
        } else {
            audio.pause();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            currentlyPlaying = null;
            console.log('Audio playback paused');
        }
    }
    
    function addVoiceMessage(audioUrl, transcript, isAI) {
        console.log('Adding voice message:', { audioUrl, transcript, isAI });
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
                    console.log('Audio playback ended');
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
        console.log('Voice message added successfully');
    }
    
    async function sendVoiceMessage(audioBlob) {
        console.log('Sending voice message, blob size:', audioBlob.size, 'bytes');
        if (!audioBlob || audioBlob.size === 0) {
            console.error('Invalid audio blob:', { size: audioBlob?.size });
            showStatus('No audio to send', 2000);
            return;
        }
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        
        showStatus('Processing...', 0);
        console.log('Sending voice message to server...');
        
        try {
            const response = await fetch('/voice-message', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            console.log('Server response status:', response.status);
            
            if (!response.ok) {
                let errorMessage = 'Failed to process message';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            console.log('Server response data:', {
                success: data.success,
                hasTranscript: !!data.transcript,
                hasAudioUrl: !!data.ai_audio_url
            });
            
            if (data.success) {
                if (data.transcript) {
                    console.log('Adding user transcript message');
                    addVoiceMessage(null, data.transcript, false);
                }
                
                if (data.ai_audio_url && data.ai_response) {
                    console.log('Adding AI response message');
                    addVoiceMessage(data.ai_audio_url, data.ai_response, true);
                }
                
                showStatus('Hold to Talk', 0);
            } else {
                throw new Error(data.error || 'Failed to process message');
            }
        } catch (error) {
            console.error('Error sending voice message:', error);
            showStatus('Error: ' + (error.message || 'Failed to send message'), 3000);
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
        
        // Initialize scroll observer
        const scrollObserver = observeScroll(voiceMessages);
        
        // Cleanup function for scroll observer
        window.addEventListener('unload', () => {
            if (scrollObserver) {
                scrollObserver.disconnect();
            }
        });
    }
    
    // Initial setup
    if (recordButton) {
        console.log('Initializing voice chat interface');
        setupRecording().then(() => {
            showStatus('Hold to Talk', 0);
            console.log('Voice chat interface ready');
        });
    }
});