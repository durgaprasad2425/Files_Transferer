// OmniShare P2P Controller

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // --- INITIALIZATION ---
    const peer = new Peer({
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { 
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                { 
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                { 
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        }
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        if (err.type === 'peer-unavailable') {
            alert('Could not connect: The other device is offline or the ID is invalid.');
        } else if (err.type === 'network') {
            alert('Network error: Could not reach signaling server.');
        } else if (err.type === 'webrtc') {
            alert('WebRTC error: Connection failed. You might be behind a strict firewall.');
        }
    });
    let currentConn = null;

    const peerIdDisplay = document.getElementById('peer-id-display');
    const qrcodeDiv = document.getElementById('qrcode');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const transferStatus = document.getElementById('transfer-status');
    const progressFill = document.getElementById('progress-fill');
    const filenameDisplay = document.getElementById('filename-display');
    const percentDisplay = document.getElementById('percent-display');

    // --- PEER JS EVENTS ---
    peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        peerIdDisplay.innerText = "Device Online";
        
        // Generate Pairing Link & QR
        const pairingLink = `${window.location.origin}${window.location.pathname}?pair=${id}`;
        new QRCode(qrcodeDiv, {
            text: pairingLink,
            width: 120,
            height: 120,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        // Check if we are joining from a link (e.g., on Mobile)
        const urlParams = new URLSearchParams(window.location.search);
        const pairId = urlParams.get('pair');
        if (pairId) {
            setTimeout(() => {
                connectToPeer(pairId);
            }, 500);
        }
    });

    peer.on('connection', (conn) => {
        handleConnection(conn);
    });

    function connectToPeer(id) {
        const conn = peer.connect(id, { reliable: true });
        handleConnection(conn);
    }

    function handleConnection(conn) {
        currentConn = conn;
        peerIdDisplay.innerText = "Device Paired";
        peerIdDisplay.style.color = "var(--primary)";
        
        // Update Device Icon to Mobile if paired
        const deviceIconWrap = document.querySelector('.device-icon');
        if (deviceIconWrap) {
            deviceIconWrap.innerHTML = '<i data-lucide="smartphone" style="width: 40px; height: 40px; color: white;"></i>';
            lucide.createIcons();
        }

        let receivingFile = null;
        let receivedChunks = [];
        let receivedBytes = 0;

        conn.on('data', (data) => {
            if (data.type === 'file-start') {
                transferStatus.style.display = 'block';
                filenameDisplay.innerText = `Receiving: ${data.name}`;
                updateProgress(0);
                
                receivingFile = {
                    name: data.name,
                    fileType: data.fileType,
                    size: data.size,
                    totalChunks: data.totalChunks
                };
                receivedChunks = [];
                receivedBytes = 0;
            } else if (data.type === 'file-chunk') {
                receivedChunks.push(data.data);
                receivedBytes += data.data.byteLength;
                
                if (receivingFile && receivingFile.size > 0) {
                    const percent = Math.round((receivedBytes / receivingFile.size) * 100);
                    updateProgress(Math.min(percent, 100));
                }
            } else if (data.type === 'file-end') {
                if (receivingFile) {
                    const blob = new Blob(receivedChunks, { type: receivingFile.fileType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = receivingFile.name;
                    a.click();
                    
                    setTimeout(() => {
                        transferStatus.style.display = 'none';
                        alert(`Received: ${receivingFile.name}`);
                    }, 500);
                    
                    receivingFile = null;
                    receivedChunks = [];
                }
            } else if (data.type === 'file') {
                receiveFile(data);
            }
        });

        console.log('Connected to device!');
    }

    // --- FILE TRANSFER LOGIC ---
    dropZone.onclick = () => {
        fileInput.value = '';
        fileInput.click();
    };

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) sendFile(file);
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "var(--primary)";
    };

    dropZone.ondragleave = () => {
        dropZone.style.borderColor = "var(--border)";
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) sendFile(file);
    };

    async function sendFile(file) {
        if (!currentConn) {
            alert("Please pair with a mobile device or another PC first!");
            return;
        }

        if (!currentConn.open) {
            alert("The secure connection is still being established in the background. Please wait a few seconds and try again.");
            return;
        }

        transferStatus.style.display = 'block';
        filenameDisplay.innerText = `Sending: ${file.name}`;
        updateProgress(0);

        const CHUNK_SIZE = 16 * 1024; // 16KB safe limit for WebRTC
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        currentConn.send({
            type: 'file-start',
            name: file.name,
            fileType: file.type,
            size: file.size,
            totalChunks: totalChunks
        });

        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await slice.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            
            currentConn.send({
                type: 'file-chunk',
                data: uint8Array,
                index: chunkIndex
            });
            
            offset += CHUNK_SIZE;
            chunkIndex++;
            
            const percent = Math.round((offset / file.size) * 100);
            updateProgress(Math.min(percent, 100));
            
            // Sleep slightly to let the browser process the WebRTC buffer
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        currentConn.send({ type: 'file-end' });
        
        setTimeout(() => {
            transferStatus.style.display = 'none';
            alert('File sent successfully!');
        }, 500);
    }

    function receiveFile(data) {
        // Fallback for older version
        transferStatus.style.display = 'block';
        filenameDisplay.innerText = `Receiving: ${data.name}`;
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 20;
            updateProgress(progress);
            if (progress >= 100) {
                clearInterval(interval);
                
                const blob = new Blob([data.data], { type: data.fileType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.name;
                a.click();
                
                setTimeout(() => {
                    transferStatus.style.display = 'none';
                    alert(`Received: ${data.name}`);
                }, 500);
            }
        }, 50);
    }

    function updateProgress(percent) {
        progressFill.style.width = `${percent}%`;
        percentDisplay.innerText = `${percent}%`;
    }
});
