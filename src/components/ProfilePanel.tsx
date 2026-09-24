import { useState } from "react";
import type { PlayerProfile } from "../game/life";

interface Props {
  profile: PlayerProfile;
  onSave: (profile: PlayerProfile) => void;
  onClose: () => void;
}

export default function ProfilePanel({ profile, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(profile);
  const update = <K extends keyof PlayerProfile>(key: K, value: PlayerProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="absolute inset-0 z-[75] overflow-y-auto bg-slate-950/95 p-4 text-white backdrop-blur-xl">
      <div className="mx-auto max-w-lg pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black">Personnalisation</h2>
            <p className="text-xs text-white/50">Sauvegardée sur cet appareil.</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2 font-bold">Fermer</button>
        </div>

        <div className="mt-5 space-y-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
          <label className="block text-sm font-bold">
            Pseudo
            <input
              value={draft.nickname}
              maxLength={24}
              onChange={(event) => update("nickname", event.target.value)}
              className="mt-2 w-full rounded-xl bg-black/30 px-4 py-3 outline-none ring-1 ring-white/15 focus:ring-sky-400"
            />
          </label>

          <div>
            <div className="text-sm font-bold">Genre</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["femme", "homme", "personnalise"] as const).map((gender) => (
                <button
                  key={gender}
                  onClick={() => update("gender", gender)}
                  className={`rounded-xl px-3 py-2 text-sm font-bold capitalize ${
                    draft.gender === gender ? "bg-sky-400 text-slate-950" : "bg-white/10"
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
              Teint
              <input
                type="color"
                value={draft.skinColor}
                onChange={(event) => update("skinColor", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl bg-white/10 p-1"
              />
            </label>
            <label className="text-sm font-bold">
              Haut
              <input
                type="color"
                value={draft.shirtColor}
                onChange={(event) => update("shirtColor", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl bg-white/10 p-1"
              />
            </label>
          </div>
          <Select label="Coiffure" value={draft.hair} values={["Court", "Tresses", "Locks", "Rasé", "Afro"]} onChange={(value) => update("hair", value)} />
          <Select label="Tenue de travail" value={draft.workOutfit} values={["Tenue bleue", "Gilet réfléchissant", "Chemise Beni", "Veste noire"]} onChange={(value) => update("workOutfit", value)} />
          <Select label="Tenue de loisir" value={draft.leisureOutfit} values={["Chemise locale", "Tenue sportive", "Robe colorée", "Jean et polo"]} onChange={(value) => update("leisureOutfit", value)} />
          <Select label="Confidentialité" value={draft.privacy} values={["friends", "private", "public"]} onChange={(value) => update("privacy", value as PlayerProfile["privacy"])} />

          <button
            onClick={() => onSave({ ...draft, nickname: draft.nickname.trim() || "Livreur de Beni" })}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 font-black text-slate-950 active:scale-95"
          >
            Sauvegarder le personnage
          </button>
          <p className="text-center text-[11px] leading-relaxed text-white/40">
            Les cosmétiques payants réels sont désactivés tant qu'aucun service de paiement et serveur de validation n'est configuré. Ils ne donneront jamais d'avantage de jeu.
          </p>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-3 outline-none ring-1 ring-white/15">
        {values.map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>
  );
}