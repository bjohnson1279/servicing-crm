import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GeoLocation } from '../domain/GeoLocation';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Job {
  id: string;
  location: GeoLocation;
  title: string;
}

const mockJobs: Job[] = [
  { id: '1', location: new GeoLocation(40.7128, -74.0060), title: 'Job 1 - Downtown' },
  { id: '2', location: new GeoLocation(40.7300, -73.9900), title: 'Job 2 - Midtown' },
];

const mockRoute: GeoLocation[] = [
  new GeoLocation(40.7128, -74.0060),
  new GeoLocation(40.7200, -74.0000),
  new GeoLocation(40.7300, -73.9900),
];

export const DailyRoute: React.FC = () => {
  // Memoize marker rendering to prevent unnecessary recalculation of Map elements during component re-renders
  const markers = useMemo(() => {
    return mockJobs.map(job => (
      React.createElement(Marker as any, { key: job.id, position: job.location.toTuple() },
        React.createElement(Popup as any, null,
          job.title,
          React.createElement('br'),
          React.createElement(Link, { to: `/job/${job.id}` }, 'View Details')
        )
      )
    ));
  }, []);

  const routePositions = useMemo(() => {
    return mockRoute.map(loc => loc.toTuple());
  }, []);

  const mapCenter = useMemo(() => {
    return new GeoLocation(40.7200, -73.9950).toTuple();
  }, []);

  return (
    <div>
      <h2>Daily Route</h2>
      <div style={{ height: '400px', width: '100%' }}>
        {React.createElement(MapContainer as any, { center: mapCenter, zoom: 13, style: { height: '100%', width: '100%' } },
          React.createElement(TileLayer as any, {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "&copy; OpenStreetMap contributors"
          }),
          React.createElement(Polyline as any, { positions: routePositions, color: "blue" }),
          markers
        )}
      </div>
    </div>
  );
};
