import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Job {
  id: string;
  lat: number;
  lng: number;
  title: string;
}

const mockJobs: Job[] = [
  { id: '1', lat: 40.7128, lng: -74.0060, title: 'Job 1 - Downtown' },
  { id: '2', lat: 40.7300, lng: -73.9900, title: 'Job 2 - Midtown' },
];

const mockRoute = [
  [40.7128, -74.0060],
  [40.7200, -74.0000],
  [40.7300, -73.9900],
];

export const DailyRoute: React.FC = () => {
  return (
    <div>
      <h2>Daily Route</h2>
      <div style={{ height: '400px', width: '100%' }}>
        <MapContainer center={[40.7200, -73.9950]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <Polyline positions={mockRoute as any} color="blue" />
          {mockJobs.map(job => (
            <Marker key={job.id} position={[job.lat, job.lng]}>
              <Popup>
                {job.title} <br/>
                <Link to={`/job/${job.id}`}>View Details</Link>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
