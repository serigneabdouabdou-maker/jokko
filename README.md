# Jokko — la boutique qui écoute

Assistant vocal pour les commerçants au Sénégal. Le commerçant parle en wolof, en français, en anglais ou en pulaar.
Jokko enregistre les ventes, les dépenses, le stock, les dettes et les factures, et répond avec sa voix.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis mettre la clé Gemini dans GEMINI_API_KEY
npm run dev                  # http://localhost:5173
```

Production : `npm run build` puis `npm start` (port 8787).

## Variables d'environnement (`.env.local`, jamais sur GitHub)

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | Clé Gemini, utilisée seulement par le serveur |
| `GEMINI_LIVE_MODEL` | Modèle de conversation en direct (par défaut `gemini-2.5-flash-native-audio-latest`) |
| `GEMINI_TTS_VOICE` | Voix de Jokko (par défaut `Sulafat`) |
| `GEMINI_MODEL` | Modèle du mode secours (texte ou message vocal) |

Ne jamais créer `VITE_GEMINI_API_KEY` : la clé serait visible dans le navigateur.

## Comment marche la voix

- **Une seule voix** : Jokko parle uniquement par la conversation en direct Gemini Live, avec la voix Sulafat.
  Si la conversation en direct ne marche pas, Jokko répond par écrit (jamais avec une autre voix).
- **Enregistrement automatique** : dès que la phrase est complète (« Jaay naa ñaari bidon diw »), c'est enregistré.
  Pour défaire : dire « déedéet » / « annule », ou toucher **Annuler**.
- **Phrase incomplète** : Jokko pose une seule question courte (« Ñaata ? »).
- Le cœur est dans `src/assistant/liveDesk.ts` (enregistrer / annuler) et `server/assistant/live.ts` (consignes et outils).

## Tests

```bash
npm test             # tests rapides, sans Gemini
npm run test:live    # tests avec la vraie clé Gemini (coûte un peu de quota)
npm run typecheck
```

## Structure

```
server/            serveur Node : routes /api/assistant/* (Gemini côté serveur)
  assistant/live.ts      conversation en direct : consignes wolof, outils, jeton à usage unique
  assistant/interpret.ts mode secours : comprendre un texte ou un message vocal
src/
  App.tsx                interface (écrans Parler, Ventes, Stock, Clients…)
  model.ts               données de la boutique (aujourd'hui dans le navigateur)
  assistant/liveDesk.ts  enregistre ce que Jokko comprend, avec annulation
  assistant/apply.ts     calcule l'effet d'une écriture sur la boutique
  talk.ts                mode local sans Gemini
```

Voir `docs/PLAN.md` pour la feuille de route.
