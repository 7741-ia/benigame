import { useState } from "react";
import { usePWAInstall, useOnlineStatus } from "../utils/usePWAInstall";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-md active:scale-95 transition"
      >
        <span>📲</span>
        <span>Installer l'app (Hors-ligne)</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-bold text-white shadow-md active:scale-95 transition"
        >
          <span>📲</span>
          <span>Installer sur iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/20 p-5 shadow-2xl text-white">
              <h3 className="text-base font-black text-emerald-400">Installer Beni Life sur iOS</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/70">
                1. Appuyez sur le bouton <strong>Partager</strong> <span className="text-sm">⎋</span> dans la barre Safari.<br />
                2. Faites défiler et choisissez <strong>Sur l'écran d'accueil</strong>.<br />
                3. Lancez le jeu depuis l'icône pour jouer 100% hors-ligne !
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-white/15 py-2 text-xs font-black text-white hover:bg-white/25 transition"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600/90 px-3 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Mode Hors-Ligne actif — Jeu 100% autonome
    </div>
  );
};
