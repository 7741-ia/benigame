import type { LifeState, PlayerProfile, Recipe } from "../game/life";
import { MARKET_ITEMS, RECIPES } from "../game/life";
import { useState } from "react";

interface Props {
  life: LifeState;
  profile: PlayerProfile;
  wallet: number;
  mode: "home" | "market" | "activities";
  onClose: () => void;
  onMap: () => void;
  onRest: () => void;
  onSleep: () => void;
  onWash: () => void;
  onSit: () => void;
  onCook: (recipe: Recipe) => void;
  onEat: (recipe: Recipe) => void;
  onBuyIngredient: (ingredient: string) => void;
  onBuyFurniture: (item: string, price: number) => void;
  onParty: () => void;
}

export default function HomePanel(props: Props) {
  const { life, profile, wallet, mode, onClose } = props;
  const [room, setRoom] = useState<"bedroom" | "bathroom" | "living" | "dining" | "kitchen">("living");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const roomInfo = {
    bedroom: { icon: "🛏️", label: "Chambre à coucher", text: "Un vrai lit pour dormir et récupérer complètement." },
    bathroom: { icon: "🚿", label: "Salle de bain", text: "Se laver, se rafraîchir et repartir propre." },
    living: { icon: "🛋️", label: "Salon", text: "S'asseoir, se reposer et recevoir les amis." },
    dining: { icon: "🍽️", label: "Salle à manger", text: "Servir et manger le repas préparé." },
    kitchen: { icon: "🍳", label: "Cuisine", text: "Ouvrir le tiroir, choisir les ingrédients et préparer." },
  }[room];
  return (
    <div className="absolute inset-0 z-[75] overflow-y-auto bg-gradient-to-b from-[#2f2118] to-slate-950 p-4 text-white">
      <div className="mx-auto max-w-2xl pb-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Beni Life</div>
            <h2 className="text-3xl font-black">
              {mode === "market" ? "Marché" : mode === "activities" ? "Sorties et événements" : `Maison de ${profile.nickname}`}
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
        ) : mode === "activities" ? (
          <section className="mt-6 space-y-3">
            <Activity title="Fête de quartier" detail="Décoration, musique, danse et repas avec des PNJ du quartier." action="Organiser ($15)" onClick={props.onParty} disabled={wallet < 15} />
            <Activity title="Promenade en groupe" detail="Choisis un lieu de loisirs sur la carte et rejoins-le à pied ou en véhicule." action="Voir la carte" onClick={props.onMap} />
            <div className="rounded-2xl bg-amber-400/10 p-4 text-sm text-amber-100 ring-1 ring-amber-300/20">
            
              Les invitations de vrais joueurs resteront désactivées tant qu'aucun serveur multijoueur authentifié n'est configuré.

            </div>
          </section>
        ) : (
          <>
            <section className="mt-5 rounded-3xl bg-[#9a6a45]/25 p-3 ring-1 ring-amber-200/15">
              <div className="relative h-44 overflow-hidden rounded-2xl bg-[#c79a6b]/20 p-3">
                <div className="absolute inset-3 grid grid-cols-3 grid-rows-2 gap-2">
                  {(["bedroom", "bathroom", "living", "dining", "kitchen"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setRoom(key)}
                      className={`rounded-xl border-2 p-2 text-left transition active:scale-95 ${
                        room === key ? "border-amber-300 bg-amber-300/25" : "border-white/15 bg-black/10"
                      } ${key === "living" ? "col-span-2" : ""}`}
                    >
                      <div className="text-xl">{roomInfoFor(key).icon}</div>
                      <div className="mt-1 text-[10px] font-black leading-tight">{roomInfoFor(key).label}</div>
                    </button>
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-1 right-2 text-[9px] font-bold text-white/35">PLAN DE LA MAISON</div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl bg-white/7 p-4 ring-1 ring-white/10">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{roomInfo.icon}</div>
                <div>
                  <h3 className="font-black">{roomInfo.label}</h3>
                  <p className="text-xs text-white/50">{roomInfo.text}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {room === "bedroom" && <button onClick={props.onSleep} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-black">Dormir dans le lit</button>}
                {room === "bathroom" && <button onClick={props.onWash} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950">Prendre une douche</button>}
                {room === "living" && <><button onClick={props.onSit} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-black">S'asseoir</button><button onClick={props.onParty} className="rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-black">Inviter des amis</button></>}
                {room === "dining" && <div className="rounded-xl bg-amber-400/15 px-4 py-2 text-sm text-amber-100">Prépare d'abord un repas dans la cuisine.</div>}
                {room === "kitchen" && <div className="rounded-xl bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100">Ouvre un tiroir ci-dessous, sélectionne une recette puis sers-la à table.</div>}
              </div>
            </section>

            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Action icon="🛏️" title="Dormir" detail="Énergie complète" onClick={props.onSleep} />
              <Action icon="🪑" title="Se reposer" detail="Récupération légère" onClick={props.onRest} />
              <Action icon="🎉" title="Recevoir" detail={`${life.partiesHosted} fêtes organisées`} onClick={props.onParty} />
            </section>

            {room === "kitchen" && <section className="mt-7">
              <h3 className="text-xl font-black">Cuisine congolaise</h3>
              <p className="text-sm text-white/50">Ouvre le tiroir, choisis les ingrédients, puis prépare le repas.</p>
              <button onClick={() => setDrawerOpen((open) => !open)} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-amber-400/15 p-4 text-left ring-1 ring-amber-300/20">
                <span className="font-black">🗄️ Tiroir à ingrédients</span>
                <span className="text-xs text-amber-200">{drawerOpen ? "Fermer" : "Ouvrir"}</span>
              </button>
              {drawerOpen && <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-3 text-center text-xs">
                {Object.entries(life.ingredients).map(([name, amount]) => <div key={name} className="rounded-xl bg-white/7 p-2"><div className="text-xl">🥣</div><div className="capitalize">{name}</div><b className="text-amber-300">x{amount}</b></div>)}
              </div>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {RECIPES.map((recipe) => {
                  const available = Object.entries(recipe.ingredients).every(([key, amount]) => (life.ingredients[key] || 0) >= amount);
                  return (
                    <button key={recipe.id} disabled={!available} onClick={() => props.onCook(recipe)} className="rounded-2xl bg-white/7 p-4 text-left ring-1 ring-white/10 disabled:opacity-35">
                      <div className="font-black text-amber-200">{recipe.name}</div>
                      <div className="mt-1 text-xs text-white/50">{recipe.description}</div>
                      <div className="mt-3 text-[11px] text-white/70">
                        {Object.entries(recipe.ingredients).map(([key, amount]) => `${key} x${amount}`).join(" · ")}
                      </div>
                      <div className="mt-2 text-[10px] font-bold text-emerald-300">Préparer ce plat</div>
                    </button>
                  );
                })}
              </div>
            </section>}

            {room === "dining" && <section className="mt-7 rounded-2xl bg-white/7 p-4 ring-1 ring-white/10">
              <h3 className="text-xl font-black">Repas prêts à servir</h3>
              {life.preparedMeals.length === 0 ? <p className="mt-2 text-sm text-white/50">Aucun plat préparé. Va en cuisine.</p> : <div className="mt-3 space-y-2">{life.preparedMeals.map((id) => { const recipe = RECIPES.find((item) => item.id === id); if (!recipe) return null; return <button key={id} onClick={() => props.onEat(recipe)} className="flex w-full items-center justify-between rounded-xl bg-emerald-500/15 px-4 py-3 text-left ring-1 ring-emerald-300/20"><span className="font-bold">🍽️ {recipe.name}</span><span className="text-xs font-black text-emerald-300">Manger</span></button>; })}</div>}
            </section>}

            <section className="mt-7">
              <h3 className="text-xl font-black">Décoration</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[{ name: "Canapé coloré", price: 40 }, { name: "Radio de salon", price: 25 }, { name: "Table familiale", price: 30 }, { name: "Lampes festives", price: 20 }].map((item) => {
                  const owned = life.furniture.includes(item.name);
                  return (
                    <button key={item.name} disabled={owned || wallet < item.price} onClick={() => props.onBuyFurniture(item.name, item.price)} className="rounded-2xl bg-white/7 p-4 text-left ring-1 ring-white/10 disabled:opacity-40">
                      <div className="font-bold">{item.name}</div>
                      <div className="text-xs text-amber-300">{owned ? "Possédé" : `$${item.price}`}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Action({ icon, title, detail, onClick }: { icon: string; title: string; detail: string; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-2xl bg-white/7 p-4 text-left ring-1 ring-white/10 active:scale-95"><div className="text-3xl">{icon}</div><div className="mt-2 font-black">{title}</div><div className="text-xs text-white/45">{detail}</div></button>;
}

function Activity({ title, detail, action, onClick, disabled = false }: { title: string; detail: string; action: string; onClick: () => void; disabled?: boolean }) {
  return <div className="rounded-2xl bg-white/7 p-4 ring-1 ring-white/10"><div className="font-black">{title}</div><p className="mt-1 text-sm text-white/50">{detail}</p><button disabled={disabled} onClick={onClick} className="mt-3 rounded-xl bg-fuchsia-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-35">{action}</button></div>;
}

function roomInfoFor(key: "bedroom" | "bathroom" | "living" | "dining" | "kitchen") {
  return {
    bedroom: { icon: "🛏️", label: "Chambre" },
    bathroom: { icon: "🚿", label: "Salle de bain" },
    living: { icon: "🛋️", label: "Salon" },
    dining: { icon: "🍽️", label: "Salle à manger" },
    kitchen: { icon: "🍳", label: "Cuisine" },
  }[key];
}