document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const recordingStatus = document.getElementById('recordingStatus');
    const statusText = recordingStatus.querySelector('.status-text');
    const recordingTime = recordingStatus.querySelector('.recording-time');
    const voiceMessages = document.getElementById('voice-messages');
    
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
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
        isRecording = true;
        startTime = Date.now();
        recordButton.classList.add('recording');
        recordButton.querySelector('.record-text').textContent = 'Stop Recording';
        statusText.textContent = 'Recording...';
        recordingTimer = setInterval(updateRecordingTime, 1000);
    }
    
    // Stop recording
    function stopRecording() {
        mediaRecorder.stop();
        isRecording = false;
        clearInterval(recordingTimer);
        recordButton.classList.remove('recording');
        recordButton.querySelector('.record-text').textContent = 'Start Recording';
        statusText.textContent = 'Click to start recording';
        recordingTime.textContent = '';
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
            }
        })
        .catch(error => {
            console.error('Error sending voice message:', error);
            statusText.textContent = 'Error sending voice message';
        });
    }
    
    // Add voice message to chat
    function addVoiceMessage(audioUrl, transcript, isAI) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `voice-message ${isAI ? 'ai-message' : 'user-message'}`;
        
        messageDiv.innerHTML = `
            <div class="voice-message-content">
                <audio controls src="${audioUrl}"></audio>
                <div class="voice-transcript">${transcript}</div>
            </div>
            <div class="voice-message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        
        voiceMessages.appendChild(messageDiv);
        voiceMessages.scrollTop = voiceMessages.scrollHeight;
    }
    
    // Toggle recording
    recordButton.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
});
