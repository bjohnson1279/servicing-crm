import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export const ChemicalLog: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.error('Camera error:', e);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        setPhoto(canvas.toDataURL('image/jpeg'));
        
        // Stop camera
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      }
    }
  };

  return (
    <div>
      <h2>Chemical Log - Job {id}</h2>
      
      {!photo ? (
        <div>
          <button onClick={startCamera}>Start Camera</button>
          <br/>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '400px' }} />
          <br/>
          <button onClick={capturePhoto}>Take Photo</button>
        </div>
      ) : (
        <div>
          <img src={photo} alt="Chemical application" style={{ width: '100%', maxWidth: '400px' }} />
          <br/>
          <button onClick={() => setPhoto(null)}>Retake</button>
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => navigate(`/job/${id}`)}>Save & Return</button>
      </div>
    </div>
  );
};
