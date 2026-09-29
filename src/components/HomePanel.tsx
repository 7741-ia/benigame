import type { LifeState } from "../game/life";
import { MARKET_ITEMS } from "../game/life";

interface Props {
  life: LifeState;
  wallet: number;
  mode: "market" | "activities";
  onClose: () => void;
  onMap: () => void;
  onBuyIngredient: (ingredient: string) => void;
  onParty: () => void;
}

export default function HomePanel(props: Props) {
  const { life, wallet, mode, onClose } = props;
  return (
    <div className="absolute inset-0 z-[75] overflow-y-auto bg-gradient-to-b from-[#2f2118] to-slate-950 p-4 text-white">
      <div className="mx-auto max-w-2xl pb-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Beni Life</div>
            <h2 className="text-3xl font-black">
              {mode === "market" ? "Marché de Beni" : "Sorties et événements"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2 font-bold">Fermer</button>
        </div>

        {mode === "market" ? (
          <section className="mt-6">
            <p className="text-sm text-white/60">Chaque ingrédient coûte 2 $. Solde : ${wallet}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MARKET_ITEMS.map((item) => (
                <button key={item} onClick={() => props.onBuyIngredient(item)} disabled={wallet < 2} className="rounded-2xl bg-white/7 p-4 text-left capitalize ring-1 ring-white/10 disabled:opacity-35">
                  <div className="text-2xl">🧺</div>
                  <div className="mt-2 font-black">{item}</div>
                  <div className="text-xs text-amber-300">$2 · stock {life.ingredients[item] || 0}</div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            <Activity title="Fête de quartier" detail="Décoration, musique, danse et repas avec des PNJ du quartier." action="Organiser ($15)" onClick={props.onParty} disabled={wallet < 15} />
            <Activity title="Promenade en groupe" detail="Choisis un lieu de loisirs sur la carte et rejoins-le à pied ou en véhicule." action="Voir la carte" onClick={props.onMap} />
            <div className="rounded-2xl bg-amber-400/10 p-4 text-sm text-amber-100 ring-1 ring-amber-300/20">
              Les invitations de vrais joueurs resteront désactivées tant qu'aucun serveur multijoueur authentifié n'est configuré.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Activity({ title, detail, action, onClick, disabled = false }: { title: string; detail: string; action: string; onClick: () => void; disabled?: boolean }) {
  return <div className="rounded-2xl bg-white/7 p-4 ring-1 ring-white/10"><div className="font-black">{title}</div><p className="mt-1 text-sm text-white/50">{detail}</p><button disabled={disabled} onClick={onClick} className="mt-3 rounded-xl bg-fuchsia-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-35">{action}</button></div>;
}