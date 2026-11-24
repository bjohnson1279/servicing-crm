import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { enqueueRequest, syncQueue } from '../offlineQueue';

export const SignatureCapture: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveSignature = async () => {
    if (sigCanvas.current?.isEmpty()) {
      setError('Please provide a signature first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dataUrl = sigCanvas.current?.toDataURL('image/png') || '';
      await enqueueRequest(`/api/v1/jobs/${id}/signature`, 'POST', {
        signatureDataUrl: dataUrl,
        capturedAt: new Date().toISOString(),
      });
      void syncQueue();
      navigate(`/job/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const clearSignature = () => {
    if (window.confirm('Are you sure you want to clear the signature?')) {
      sigCanvas.current?.clear();
      setError(null);
      setHasSignature(false);
    }
  };

  return (
    <div>
      <h2>Customer Signature - Job {id}</h2>
      {error && (
        <div role="alert" aria-live="assertive" style={{ color: '#991b1b', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #fecaca', width: '278px' }}>
          {error}
        </div>
      )}
      <div style={{ border: '1px solid #ccc', width: '300px', height: '200px' }}>
        <SignatureCanvas 
          ref={sigCanvas}
          // @ts-ignore - react-signature-canvas types are missing onBegin
          onBegin={() => setError(null)}
          // @ts-ignore - react-signature-canvas types are missing onEnd
          onEnd={() => setHasSignature(true)}
          canvasProps={{ width: 300, height: 200, className: 'sigCanvas', 'aria-label': 'Signature Pad' }}
        />
      </div>
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={clearSignature}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={hasSignature && !saving ? () => void saveSignature() : (e) => e.preventDefault()}
          aria-disabled={!hasSignature || saving}
          title={!hasSignature ? "Please draw a signature before saving" : "Save signature"}
          className="px-4 py-2 border border-blue-500 bg-blue-500 text-white rounded hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
          style={{
            marginLeft: '10px',
            opacity: !hasSignature || saving ? 0.6 : 1,
            cursor: !hasSignature || saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div style={{ marginTop: '20px' }}>
        <button
          onClick={() => navigate(`/job/${id}`)}
          className="px-4 py-2 text-gray-700 underline rounded hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
