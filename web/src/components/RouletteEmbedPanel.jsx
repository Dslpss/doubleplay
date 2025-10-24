import { useState } from 'react';

const DEFAULT_URL = 'https://playnabets.com/live-casino/pragmatic/237';

export default function RouletteEmbedPanel({ url = DEFAULT_URL }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [blocked, setBlocked] = useState(false);

  const handleReload = () => {
    setBlocked(false);
    setCurrentUrl(prev => prev + (prev.includes('?') ? '&' : '?') + 't=' + Date.now());
  };

  const openNewTab = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      alert('URL copiada para a área de transferência');
    } catch {
      alert('Falha ao copiar URL');
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 360 }}>
      <div style={{ padding: 8, background: '#111827', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Roleta (Play na Bets)</strong>
        <span style={{ marginLeft: 'auto' }} />
        <button onClick={handleReload}>Recarregar</button>
        <button onClick={copyUrl}>Copiar URL</button>
        <button onClick={openNewTab}>Abrir em nova aba</button>
      </div>

      {!blocked ? (
        <iframe
          src={currentUrl}
          title="Roleta Play na Bets"
          style={{ flex: 1, minHeight: 480, border: 'none', background: '#000' }}
          allow="clipboard-write; fullscreen; autoplay"
          onError={() => setBlocked(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div style={{ padding: 16, color: '#fff', background: '#1f2937' }}>
          <p style={{ marginBottom: 8 }}>O site bloqueou a incorporação em iframe (X-Frame-Options/CSP).</p>
          <p style={{ marginBottom: 12 }}>Use os botões acima para abrir em nova aba.</p>
          <button onClick={handleReload}>Tentar novamente</button>
        </div>
      )}
    </div>
  );
}