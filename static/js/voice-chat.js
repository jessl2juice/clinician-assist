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
            statusText.textContent = 'Hold to Talk';
            recordingTime.textContent = '';
        }
    }
    
    // Send voice message to server
    function sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.wav');
        
        fetch('/voice-message', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addVoiceMessage(data.audioUrl, data.transcript, false);
                if (data.ai_response) {
                    addVoiceMessage(null, data.ai_response, true);
                }
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
    
    // Add voice message to chat
    function addVoiceMessage(audioUrl, content, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'}`;
        
        let messageContent = '';
        if (audioUrl) {
            messageContent += `<audio controls src="${audioUrl}"></audio>`;
        }
        messageContent += `<div class="voice-transcript">${content}</div>`;
        
        messageDiv.innerHTML = `
            <div class="voice-message-content">
                ${messageContent}
            </div>
            <div class="voice-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
        statusText.textContent = 'Hold to Talk';
    });
});
