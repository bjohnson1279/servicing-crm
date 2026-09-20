import React, { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';

export const SignatureCapture: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const saveSignature = () => {
    if (sigCanvas.current?.isEmpty()) {
      alert('Please provide a signature first.');
      return;
    }
    const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    console.log('Saved Signature:', dataUrl);
    // TODO: enqueue offline request to save signature
    navigate(`/job/${id}`);
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  return (
    <div>
      <h2>Customer Signature - Job {id}</h2>
      <div style={{ border: '1px solid #ccc', width: '300px', height: '200px' }}>
        <SignatureCanvas 
          ref={sigCanvas}
          canvasProps={{ width: 300, height: 200, className: 'sigCanvas' }} 
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
