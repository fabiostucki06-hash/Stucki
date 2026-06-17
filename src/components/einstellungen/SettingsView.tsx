import { ASSETS, bustCache } from '../../lib/supabase';
import { SFCheckmark } from '../Icons';

const WALLPAPERS = [
  { id: 'wp1', label: 'Wallpaper 1', url: ASSETS.wallpaper1 },
  { id: 'wp2', label: 'Wallpaper 2', url: ASSETS.wallpaper2 },
];

interface SettingsViewProps {
  currentWallpaper: string;
  onWallpaperChange: (url: string) => void;
}

export default function SettingsView({ currentWallpaper, onWallpaperChange }: SettingsViewProps) {
  return (
    <div style={{ padding: '16px 16px 32px' }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: -0.5,
        color: 'var(--label)',
        margin: '8px 0 24px',
      }}>
        Einstellungen
      </h1>

      {/* Wallpaper Section */}
      <div style={{
        background: 'rgba(255,255,255,0.70)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 8px 32px 0 rgba(0,0,0,0.10)',
        borderRadius: 18,
        padding: '18px 18px 22px',
        marginBottom: 20,
      }}>
        <p style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: 'var(--label2)',
          marginBottom: 16,
        }}>
          Hintergrundbild
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {WALLPAPERS.map((wp) => {
            const active = currentWallpaper === wp.url;
            return (
              <button
                key={wp.id}
                onClick={() => onWallpaperChange(wp.url)}
                style={{
                  position: 'relative',
                  width: 160,
                  height: 100,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: active
                    ? '2.5px solid #007AFF'
                    : '2.5px solid rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  padding: 0,
                  background: 'rgba(120,120,128,0.12)',
                  boxShadow: active
                    ? '0 0 0 4px rgba(0,122,255,0.18), 0 4px 16px rgba(0,0,0,0.15)'
                    : '0 2px 10px rgba(0,0,0,0.12)',
                  transition: 'all 0.18s ease',
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
                aria-label={wp.label}
                aria-pressed={active}
              >
                <img
                  src={bustCache(wp.url)}
                  alt={wp.label}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />

                {/* Selection badge */}
                {active && (
                  <div style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: 'linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.2)',
                    border: '1px solid #004fb0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}>
                    <SFCheckmark />
                  </div>
                )}

                {/* Label */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '16px 8px 6px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#fff',
                  textAlign: 'left',
                  letterSpacing: -0.2,
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}>
                  {wp.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
