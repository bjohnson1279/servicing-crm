import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { enqueueRequest } from '../offlineQueue';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minimumThreshold?: number;
  unitCost?: number;
  location?: string;
}

const COMMON_PESTS = [
  'Ants',
  'Termites',
  'Cockroaches',
  'Spiders',
  'Wasps & Hornets',
  'Rodents',
  'Bed Bugs',
  'Mosquitoes',
  'Fleas & Ticks',
];

const APPLICATION_METHODS = [
  'Exterior Perimeter Barrier (Liquid Spray)',
  'Broadcast Granular Application',
  'Crack & Crevice Treatment',
  'Wall Void Dusting / Injection',
  'Tamper-Resistant Bait Stations',
  'Direct Nest Treatment',
  'Interior Baseboard Treatment',
];

export const ChemicalLog: React.FC = () => {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Inventory & Selection State
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [chemicalName, setChemicalName] = useState<string>('');
  const [epaRegistrationNo, setEpaRegistrationNo] = useState<string>('');
  const [quantityUsed, setQuantityUsed] = useState<string>('1.0');
  const [unit, setUnit] = useState<string>('oz');
  const [selectedPests, setSelectedPests] = useState<string[]>(['Ants']);
  const [applicationMethod, setApplicationMethod] = useState<string>(APPLICATION_METHODS[0]);
  const [temp, setTemp] = useState<string>('72°F');
  const [windSpeed, setWindSpeed] = useState<string>('3 mph');
  const [notes, setNotes] = useState<string>('');

  // Camera & Photo State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [photo, setPhoto] = useState<string | null>(null);

  // Submission & Result State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
    details?: string;
  } | null>(null);

  // Fetch available inventory items on mount
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const res = await fetch('/api/v1/inventory/items');
        if (res.ok) {
          const data = await res.json();
          setInventoryItems(data);
        }
      } catch (err) {
        console.warn('Could not fetch inventory items (running offline or backend offline)');
      }
    };
    fetchInventory();
  }, []);

  const handleItemSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const itemId = e.target.value;
    setSelectedItemId(itemId);
    if (!itemId) {
      setChemicalName('');
      setEpaRegistrationNo('');
      return;
    }
    const item = inventoryItems.find((i) => i.id === itemId);
    if (item) {
      setChemicalName(item.name);
      // Auto-extract or suggest EPA number based on known product SKU / naming
      if (item.sku.includes('BIF')) {
        setEpaRegistrationNo('EPA Reg. No. 279-3206');
      } else if (item.sku.includes('TER')) {
        setEpaRegistrationNo('EPA Reg. No. 7969-210');
      } else if (!epaRegistrationNo) {
        setEpaRegistrationNo('EPA Reg. No. 432-1363');
      }
    }
  };

  const togglePest = (pest: string) => {
    setSelectedPests((prev) =>
      prev.includes(pest) ? prev.filter((p) => p !== pest) : [...prev, pest]
    );
  };

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.error('Camera access error');
      setResultMessage({
        type: 'warning',
        text: 'Camera access unavailable. You can use file upload instead.',
      });
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL('image/jpeg', 0.85));

        // Stop camera stream
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());
        setCameraActive(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chemicalName.trim()) {
      setResultMessage({ type: 'error', text: 'Please enter or select a chemical name' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const payload = {
      job_id: jobId || '00000000-0000-0000-0000-000000000001',
      technician_id: '00000000-0000-0000-0000-000000000002',
      chemical_name: chemicalName.trim(),
      epa_registration_no: epaRegistrationNo.trim() || undefined,
      inventory_item_id: selectedItemId || undefined,
      quantity_used: parseFloat(quantityUsed) || 1,
      unit,
      target_pests: selectedPests,
      weather_conditions: { temp, windSpeed },
      notes: notes.trim() || undefined,
      photo_url: photo || undefined,
    };

    setIsSubmitting(true);
    setResultMessage(null);

    try {
      const res = await fetch('/api/v1/inventory/chemical-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        let message = `Chemical log recorded successfully!`;
        if (data.inventory_updated || data.inventoryUpdated) {
          message += ` Auto-deducted ${quantityUsed} ${unit} from warehouse inventory.`;
        }
        if (data.low_stock_warning || data.lowStockWarning) {
          message += ` ⚠️ Stock dropped below threshold! Purchase Order draft automatically created for reorder.`;
        }
        setResultMessage({
          type: data.low_stock_warning || data.lowStockWarning ? 'warning' : 'success',
          text: message,
        });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('Network request failed, queueing offline');
      await enqueueRequest('/api/v1/inventory/chemical-logs', 'POST', payload);
      setResultMessage({
        type: 'warning',
        text: 'Device is offline or server unreachable. Log queued locally in IndexedDB and will auto-sync when online.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#1e293b' }}>Chemical Application Log</h2>
        <span style={{ fontSize: '13px', background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
          EPA Compliance
        </span>
      </div>

      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
        Job ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{jobId}</code>
      </div>

      {resultMessage && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '14px',
            borderRadius: '8px',
            marginBottom: '20px',
            backgroundColor: resultMessage.type === 'success' ? '#f0fdf4' : resultMessage.type === 'warning' ? '#fefce8' : '#fef2f2',
            border: `1px solid ${resultMessage.type === 'success' ? '#bbf7d0' : resultMessage.type === 'warning' ? '#fef08a' : '#fecaca'}`,
            color: resultMessage.type === 'success' ? '#166534' : resultMessage.type === 'warning' ? '#854d0e' : '#991b1b',
            lineHeight: '1.5',
          }}
        >
          <strong>{resultMessage.type === 'success' ? '✓ ' : 'ℹ '}</strong>
          {resultMessage.text}
          <div style={{ marginTop: '10px' }}>
            <button
              onClick={() => navigate(`/job/${jobId}`)}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '13px',
              }}
            >
              Return to Job Details
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* Inventory Item Picker */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '14px', marginBottom: '6px', color: '#334155' }}>
            Select Chemical from Inventory (Auto-deduct Stock)
          </label>
          <select
            value={selectedItemId}
            onChange={handleItemSelect}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc' }}
          >
            <option value="">-- Custom / Unlisted Chemical --</option>
            {inventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.sku}) - In Stock: {item.quantity}
              </option>
            ))}
          </select>
        </div>

        {/* Chemical Name & EPA Reg */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              Chemical Brand / Trade Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Bifenthrin Pro"
              value={chemicalName}
              onChange={(e) => setChemicalName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              EPA Registration #
            </label>
            <input
              type="text"
              placeholder="e.g. 279-3206"
              value={epaRegistrationNo}
              onChange={(e) => setEpaRegistrationNo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Quantity and Unit */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              Quantity Applied *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={quantityUsed}
              onChange={(e) => setQuantityUsed(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              Unit *
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            >
              <option value="oz">oz (ounces)</option>
              <option value="fl oz">fl oz</option>
              <option value="gallons">gallons</option>
              <option value="lbs">lbs</option>
              <option value="granules">granules</option>
            </select>
          </div>
        </div>

        {/* Application Method */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
            Application Method
          </label>
          <select
            value={applicationMethod}
            onChange={(e) => setApplicationMethod(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          >
            {APPLICATION_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Target Pests Checkboxes */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: '#334155' }}>
            Target Pests Addressed
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {COMMON_PESTS.map((pest) => {
              const checked = selectedPests.includes(pest);
              return (
                <label
                  key={pest}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${checked ? '#3b82f6' : '#e2e8f0'}`,
                    background: checked ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePest(pest)}
                  />
                  <span>{pest}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Weather Conditions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              Temperature
            </label>
            <input
              type="text"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
              Wind Speed (EPA drift guard)
            </label>
            <input
              type="text"
              value={windSpeed}
              onChange={(e) => setWindSpeed(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Application Notes */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#334155' }}>
            Application Notes & Site Observations
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Treated foundation perimeter 3ft up and 3ft out. No standing water observed."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        {/* Photo Capture Section */}
        <div style={{ marginBottom: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#334155' }}>
            Application Site Photo
          </label>

          {!photo ? (
            <div>
              {cameraActive ? (
                <div>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', borderRadius: '8px', background: '#000' }}
                  />
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📸 Snap Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const stream = videoRef.current?.srcObject as MediaStream;
                        stream?.getTracks().forEach((track) => track.stop());
                        setCameraActive(false);
                      }}
                      style={{
                        padding: '10px',
                        background: '#e2e8f0',
                        color: '#334155',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={startCamera}
                    style={{
                      padding: '8px 14px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    📷 Open Camera
                  </button>
                  <label
                    style={{
                      padding: '8px 14px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    📁 Upload File
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* ⚡ Bolt Optimization: Added loading="lazy" to defer loading off-screen images and improve initial render time */}
              <img
                src={photo}
                alt="Chemical Application"
                loading="lazy"
                style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '8px' }}
              />
              <div style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    background: '#fef2f2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Remove Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Saving & Updating Stock...' : 'Save & Log Application'}
          </button>
          <Link
            to={`/job/${jobId}`}
            style={{
              padding: '12px 16px',
              background: '#f1f5f9',
              color: '#475569',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
};
export default ChemicalLog;
