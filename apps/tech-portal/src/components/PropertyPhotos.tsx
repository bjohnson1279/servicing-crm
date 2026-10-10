import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

interface Photo {
  id: string;
  url: string;
  caption: string;
  tags: string[];
  uploaded_at: string;
}

interface PropertyPhotosProps {
  propertyId: string;
  jobId?: string;
}

const PropertyPhotos: React.FC<PropertyPhotosProps> = ({ propertyId, jobId }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');

  const fetchPhotos = async () => {
    try {
      const res = await axios.get(`/api/v1/properties/${propertyId}/photos`);
      setPhotos(res.data);
    } catch (err) {
      console.error('Failed to fetch property photos');
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [propertyId]);

  const photoNodes = useMemo(() => {
    return photos.map(p => (
      <div key={p.id} className="border rounded p-2">
        {/* ⚡ Bolt Optimization: Added loading="lazy" to defer loading off-screen images and improve initial render time */}
        <img src={p.url} alt={p.caption || 'Property photo'} loading="lazy" className="w-full h-32 object-cover mb-2" />
        <p className="text-sm">{p.caption}</p>
        <span className="text-xs text-gray-500">{new Date(p.uploaded_at).toLocaleDateString()}</span>
      </div>
    ));
  }, [photos]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('photo', file);
    if (jobId) formData.append('jobId', jobId);
    formData.append('caption', caption);

    try {
      await axios.post(`/api/v1/properties/${propertyId}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFile(null);
      setCaption('');
      fetchPhotos();
    } catch (err) {
      console.error('Failed to upload property photo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h3 className="text-lg font-bold mb-4">Property Photos</h3>
      
      <form onSubmit={handleUpload} className="mb-4">
        <div className="mb-2">
          <label htmlFor="photo-upload" className="block text-sm font-medium mb-1">
            Photo
          </label>
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
        <div className="mb-2">
          <label htmlFor="photo-caption" className="block text-sm font-medium mb-1">
            Caption
          </label>
          <input
            id="photo-caption"
            type="text"
            placeholder="Enter caption..."
            value={caption}
            onChange={e => setCaption(e.target.value)}
            className="border p-2 w-full focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
        <button 
          type="submit" 
          disabled={!file || loading}
          aria-busy={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-offset-1"
        >
          {loading ? 'Uploading...' : 'Upload Photo'}
        </button>
      </form>

      {photos.length === 0 ? (
        <div className="text-center p-6 border-2 border-dashed rounded text-gray-500">
          <p>No photos available.</p>
          <p className="text-sm mt-1">Upload a photo to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {photoNodes}
        </div>
      )}
    </div>
  );
};

export default PropertyPhotos;
