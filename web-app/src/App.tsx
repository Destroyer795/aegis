import { useState, useEffect } from 'react';

/**
 * Aegis Geo-Swarm — Main Application Shell
 *
 * This is the mobile-first PWA entry point. It will handle:
 *   1. Device Geolocation API access
 *   2. Client-side GeoHash computation (via @aegis/geo-core)
 *   3. WebSocket connection to the edge router
 *   4. WebRTC peer-to-peer data channel handoff
 */

type ConnectionStatus = 'idle' | 'locating' | 'connected' | 'alerting' | 'error';

function App() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [geohash, setGeohash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Request geolocation permission on mount
    // TODO: Compute GeoHash from lat/lng using @aegis/geo-core
    // TODO: Connect to edge router WebSocket
  }, []);

  return (
    <div className="aegis-app">
      <header className="aegis-header">
        <div className="aegis-logo">
          <span className="aegis-shield">🛡️</span>
          <h1>Aegis</h1>
        </div>
        <p className="aegis-tagline">Privacy-First Neighborhood Alerts</p>
      </header>

      <main className="aegis-main">
        <section className="aegis-status-card">
          <div className={`status-indicator status-${status}`} />
          <div className="status-info">
            <h2>Swarm Status</h2>
            <p className="status-label">
              {status === 'idle' && 'Waiting for location access…'}
              {status === 'locating' && 'Acquiring GPS position…'}
              {status === 'connected' && `Monitoring cell ${geohash ?? '—'}`}
              {status === 'alerting' && 'Broadcasting alert!'}
              {status === 'error' && (error ?? 'An error occurred')}
            </p>
          </div>
        </section>

        <section className="aegis-actions">
          <button
            className="alert-button"
            disabled={status !== 'connected'}
            onClick={() => {
              // TODO: Compose and broadcast alert via WebSocket
              setStatus('alerting');
            }}
          >
            <span className="alert-icon">⚠️</span>
            <span>Send Alert</span>
          </button>
        </section>

        <section className="aegis-privacy-badge">
          <span className="lock-icon">🔒</span>
          <p>Your GPS coordinates never leave this device.</p>
        </section>
      </main>

      <footer className="aegis-footer">
        <p>Aegis Geo-Swarm &middot; Zero-Tracking &middot; Peer-to-Peer</p>
      </footer>
    </div>
  );
}

export default App;
