import { useState } from 'react';
import { useGeolocation } from './hooks/useGeolocation';
import { useSwarmSocket } from './hooks/useSwarmSocket';
import { encodeGeoHash, AlertSeverity } from '@aegis/geo-core';
import type { AlertBroadcastPayload } from '@aegis/geo-core';
import {
  ShieldAlert,
  Lock,
  Compass,
  Send,
} from 'lucide-react';

export default function App() {
  const [alertMessage, setAlertMessage] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity>(AlertSeverity.CRITICAL);
  const [activeAlert, setActiveAlert] = useState<AlertBroadcastPayload | null>(null);

  // Hook 1: Geolocation
  const geo = useGeolocation();

  // Compute GeoHash (default: 6 chars)
  const currentGeoHash =
    geo.latitude !== null && geo.longitude !== null
      ? encodeGeoHash(geo.latitude, geo.longitude, 6)
      : null;

  // Hook 2: Swarm WebSocket Socket
  const socket = useSwarmSocket({
    latitude: geo.latitude,
    longitude: geo.longitude,
    onAlertReceived: (alert) => {
      // Trigger full-screen alerting modal
      setActiveAlert(alert);
    },
  });

  // Mock Form Lat/Lng inputs state
  const [mockLatInput, setMockLatInput] = useState('37.7749');
  const [mockLngInput, setMockLngInput] = useState('-122.4194');

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertMessage.trim()) return;

    try {
      socket.broadcastAlert(alertMessage, severity);
      setAlertMessage('');
    } catch (err: any) {
      alert(err.message || 'Failed to send alert');
    }
  };

  const handleMockInject = () => {
    const lat = parseFloat(mockLatInput);
    const lng = parseFloat(mockLngInput);
    if (isNaN(lat) || isNaN(lng)) return;
    geo.injectMockLocation(lat, lng);
  };

  return (
    <div className="aegis-app">
      {/* 1. Full Screen Warning Overlay */}
      {activeAlert && (
        <div className="alert-overlay">
          <div className="alert-modal">
            <div className="alert-modal-icon">⚠️</div>
            <h2 className="alert-modal-title">Micro-Emergency Nearby!</h2>
            <div className="alert-modal-msg">"{activeAlert.message}"</div>
            <div className="alert-modal-meta">
              <span>📍 CELL ID: {activeAlert.geohash.toUpperCase()}</span>
              <span>⚠️ SEVERITY: {activeAlert.severity}</span>
              <span>🕒 TIME: {new Date(activeAlert.timestamp).toLocaleTimeString()}</span>
              <span>🔑 SENDER SESSION: {activeAlert.originSessionId.slice(0, 8)}...</span>
            </div>
            <button className="help-btn" onClick={() => setActiveAlert(null)}>
              I Can Help
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="aegis-header">
        <div className="aegis-logo">
          <ShieldAlert className="aegis-shield" style={{ color: '#38bdf8' }} />
          <h1>Aegis</h1>
        </div>
        <p className="aegis-tagline">Privacy-Preserving Geospatial Incident Swarm</p>
      </header>

      <main className="aegis-main">
        {/* Swarm & Connection Status Bar */}
        <section className="aegis-status-card">
          <div
            className={`status-indicator status-${
              socket.status === 'connected' ? 'connected' : 'connecting'
            }`}
          />
          <div className="status-info">
            <h2>Swarm Connection</h2>
            <p className="status-label">
              {socket.status === 'connected' ? 'Monitoring neighborhood' : 'Syncing swarm…'}
            </p>
          </div>
          {currentGeoHash && <span className="status-geohash">{currentGeoHash.toUpperCase()}</span>}
        </section>

        {/* GPS Coordinate Display */}
        <section className="aegis-status-card">
          <Compass className="lock-icon" style={{ color: '#94a3b8', width: '20px' }} />
          <div className="status-info">
            <h2>Local GPS Coordinates</h2>
            <p className="status-label" style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
              {geo.latitude !== null && geo.longitude !== null
                ? `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`
                : 'Acquiring GPS position…'}
            </p>
          </div>
          {geo.isMocked && <span className="status-geohash" style={{ background: '#f59e0b', color: '#1e293b', border: 'none' }}>MOCK</span>}
        </section>

        {/* Alert Composition Form */}
        <form className="alert-form" onSubmit={handleBroadcast}>
          <div className="alert-form-title">Compose Incident Broadcast</div>
          <textarea
            className="alert-textarea"
            placeholder="Describe the micro-emergency (e.g. fallen tree blocking road, missing dog...)"
            value={alertMessage}
            onChange={(e) => setAlertMessage(e.target.value)}
            maxLength={280}
            required
          />
          <div className="alert-select-row">
            <span className="alert-select-label">Select Severity:</span>
            <select
              className="alert-select"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
            >
              <option value={AlertSeverity.INFO}>Info</option>
              <option value={AlertSeverity.WARNING}>Warning</option>
              <option value={AlertSeverity.CRITICAL}>Critical</option>
            </select>
          </div>

          <div className="aegis-actions">
            <button
              type="submit"
              className="alert-button"
              disabled={socket.status !== 'connected' || !currentGeoHash || !alertMessage.trim()}
            >
              <Send className="alert-icon" />
              <span>Broadcast Alert</span>
            </button>
          </div>
        </form>

        {/* Mock Location Panel (Demo Tool for Judges) */}
        <section className="mock-panel">
          <div className="mock-title">Demo Geofence Simulator (Mock GPS)</div>
          <div className="mock-row">
            <div className="mock-input-group">
              <label>Latitude</label>
              <input
                className="mock-input"
                type="text"
                value={mockLatInput}
                onChange={(e) => setMockLatInput(e.target.value)}
              />
            </div>
            <div className="mock-input-group">
              <label>Longitude</label>
              <input
                className="mock-input"
                type="text"
                value={mockLngInput}
                onChange={(e) => setMockLngInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="mock-btn"
              style={{ alignSelf: 'flex-end' }}
              onClick={handleMockInject}
            >
              Mock GPS
            </button>
          </div>
          <div className="mock-presets">
            <button
              type="button"
              className="mock-preset-btn"
              onClick={() => {
                setMockLatInput('37.7749');
                setMockLngInput('-122.4194');
                geo.injectMockLocation(37.7749, -122.4194);
              }}
            >
              SF Downtown (9Q8YYK)
            </button>
            <button
              type="button"
              className="mock-preset-btn"
              onClick={() => {
                setMockLatInput('37.7751');
                setMockLngInput('-122.4190');
                geo.injectMockLocation(37.7751, -122.4190);
              }}
            >
              SF Adjacent Cell
            </button>
            <button
              type="button"
              className="mock-preset-btn"
              onClick={() => {
                setMockLatInput('51.5074');
                setMockLngInput('-0.1278');
                geo.injectMockLocation(51.5074, -0.1278);
              }}
            >
              London (Far Cell)
            </button>
            {geo.isMocked && (
              <button
                type="button"
                className="mock-preset-btn"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
                onClick={() => {
                  geo.resetToRealLocation();
                }}
              >
                Reset GPS
              </button>
            )}
          </div>
        </section>

        {/* Privacy Badge */}
        <section className="aegis-privacy-badge">
          <Lock className="lock-icon" style={{ color: '#22c55e' }} />
          <p>Your coordinates never leave this device. Zero GPS tracking.</p>
        </section>
      </main>

      <footer className="aegis-footer">
        <p>Aegis Swarm Network &middot; Peer-to-Peer &middot; Local Cryptographic GeoHashing</p>
      </footer>
    </div>
  );
}
