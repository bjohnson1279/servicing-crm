import React, { useState, useEffect } from 'react';
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
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [propertyId]);

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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h3 className="text-lg font-bold mb-4">Property Photos</h3>
      
      <form onSubmit={handleUpload} className="mb-4">
        <input 
          type="file" 
          accept="image/*"
          capture="environment"
          onChange={e => setFile(e.target.files?.[0] || null)} 
          className="mb-2 block w-full"
        />
        <input 
          type="text" 
          placeholder="Caption" 
          value={caption}
          onChange={e => setCaption(e.target.value)} 
          className="border p-2 w-full mb-2"
        />
        <button 
          type="submit" 
          disabled={!file || loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload Photo'}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-4">
        {photos.map(p => (
          <div key={p.id} className="border rounded p-2">
            <img src={p.url} alt={p.caption} className="w-full h-32 object-cover mb-2" />
            <p className="text-sm">{p.caption}</p>
            <span className="text-xs text-gray-500">{new Date(p.uploaded_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PropertyPhotos;
