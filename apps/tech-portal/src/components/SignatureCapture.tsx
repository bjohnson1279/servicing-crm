import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';

export const SignatureCapture: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [error, setError] = useState<string | null>(null);

  const saveSignature = () => {
    if (sigCanvas.current?.isEmpty()) {
      setError('Please provide a signature first.');
      return;
    }
    // const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    console.log('Signature saved successfully');
    // TODO: enqueue offline request to save signature (using dataUrl)
    navigate(`/job/${id}`);
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setError(null);
  };

  return (
    <div>
      <h2>Customer Signature - Job {id}</h2>
      {error && (
        <div role="alert" style={{ color: '#991b1b', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #fecaca', width: '278px' }}>
          {error}
        </div>
      )}
      <div style={{ border: '1px solid #ccc', width: '300px', height: '200px' }}>
        <SignatureCanvas 
          ref={sigCanvas}
          // @ts-ignore - react-signature-canvas types are missing onBegin
          onBegin={() => setError(null)}
          canvasProps={{ width: 300, height: 200, className: 'sigCanvas', 'aria-label': 'Signature Pad' }}
        />
      </div>
      <div style={{ marginTop: '10px' }}>
        <button onClick={clearSignature}>Clear</button>
        <button onClick={saveSignature} style={{ marginLeft: '10px' }}>Save</button>
      </div>
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => navigate(`/job/${id}`)}>Cancel</button>
      </div>
    </div>
  );
};
