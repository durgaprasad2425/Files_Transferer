// OmniShare P2P Controller

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // --- INITIALIZATION ---
    const peer = new Peer();
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
            connectToPeer(pairId);
        }
    });

    peer.on('connection', (conn) => {
        handleConnection(conn);
    });

    function connectToPeer(id) {
        const conn = peer.connect(id);
        handleConnection(conn);
    }

    function handleConnection(conn) {
        currentConn = conn;
        peerIdDisplay.innerText = "Device Paired";
        peerIdDisplay.style.color = "var(--primary)";
        
        // Update Device Icon to Mobile if paired
        document.querySelector('.device-icon i').setAttribute('data-lucide', 'smartphone');
        lucide.createIcons();

        conn.on('data', (data) => {
            if (data.type === 'file') {
                receiveFile(data);
            }
        });

        alert('Connected to device!');
    }

    // --- FILE TRANSFER LOGIC ---
    dropZone.onclick = () => fileInput.click();

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

        transferStatus.style.display = 'block';
        filenameDisplay.innerText = `Sending: ${file.name}`;

        const buffer = await file.arrayBuffer();
        
        // For very large files, we should chunk them. For now, basic transfer:
        currentConn.send({
            type: 'file',
            name: file.name,
            fileType: file.type,
            data: buffer
        });

        // Simulate progress for UX (since direct DataChannel progress is opaque in basic PeerJS)
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            updateProgress(progress);
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    transferStatus.style.display = 'none';
                    alert('File sent successfully!');
                }, 500);
            }
        }, 100);
    }

    function receiveFile(data) {
        transferStatus.style.display = 'block';
        filenameDisplay.innerText = `Receiving: ${data.name}`;
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 20;
            updateProgress(progress);
            if (progress >= 100) {
                clearInterval(interval);
                
                // Finalize download
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
