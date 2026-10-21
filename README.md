# Groupes d'étude

Planning partagé pour organiser des groupes de travail : chacun indique ses dispos sur une semaine type et ses préférences, on voit d'un coup d'œil qui est dispo quand, on lance des sondages de dates et on planifie des séances.

## Stack
- **React 18 + Vite 5** — déployé sur Netlify via GitHub
- **Firebase Firestore** — sync temps réel (pas de Firebase Auth)
- **lucide-react** (icônes), **qrcode** (QR codes)

## Fonctionnalités

### Côté participants
- **Accès par code d'invitation** : lien `https://ton-site/?code=XXXXXX`, QR code ou saisie manuelle
- **Identité** : prénom + nom obligatoires + code perso à 4 chiffres (pour se reconnecter sur un autre appareil)
- **Anti-doublons** : nom identique bloqué (accents/majuscules ignorés) ; nom ressemblant (faute de frappe, « Alex »/« Alexandre », prénom/nom inversés) → « C'est toi ? » avant de créer
- **Mes dispos** : créneaux libres par jour (dimanche → samedi), boutons rapides (Matin, Aprèm, Soir…), copie vers Lun–Ven / tous les jours
- **Préférences** : fréquence 1 à 7×/sem, moment préféré, présentiel/visio/les deux, distance de déplacement, remarque, couleur perso
- **Vue Semaine** : grille horaire datée, un bloc coloré par personne, fond plus foncé = plus de monde dispo, rayé = visio uniquement, séances prévues en orange. Clic sur un horaire → qui est dispo + bouton « Planifier ici »
- **Vue Par jour** : liste des gens dispo avec leurs horaires en barres (type planning de rdv)
- **Créneaux** : calcul automatique des meilleurs créneaux communs (nb de personnes min, durée min) + compatibilité présentiel/visio → « Proposer en sondage » ou « Planifier »
- **Séances** : sondages de dates (Oui / Si besoin / Non, avec le nombre de dispos d'après le planning pour chaque date), clôture → la date choisie devient une séance dans le planning ; inscription « J'y vais », export agenda (.ics)
- **Participants** : fiches récap de chacun
- **Filtres** : format, déplacement, moment ; clic sur un avatar pour mettre une personne en avant
- Thème auto (selon l'heure) / clair / sombre

### Admin (`/admin`, protégé par PIN)
- **Tableau de bord** : chiffres clés, meilleurs créneaux, activité récente, répartitions, fiches pas à jour
- **Participants** : toutes les infos (code perso, dates d'inscription/modif/dernière visite, nb de modifs, code utilisé, votes, séances), modifier, supprimer, ajouter, historique par personne, **doublons possibles + fusion**
- **Codes d'accès** : créer (durée : 24 h → illimitée ou date précise, nb max d'utilisations), lien, QR code téléchargeable, activer/désactiver, remettre à zéro, voir qui s'est inscrit avec
- **Séances & sondages** : gérer/clôturer/rouvrir/supprimer tout
- **Historique** : toutes les actions (inscriptions, modifs avec avant → après, votes, codes, connexions, PIN erronés…), filtres, recherche, export CSV
- **Réglages** : nom du site, message d'accueil, code obligatoire oui/non, changer le PIN admin, exports CSV/JSON, remise à zéro

## Installation

### 1. Firebase
1. [console.firebase.google.com](https://console.firebase.google.com) → **Ajouter un projet** (ex : `groupes-etude`), Analytics inutile
2. **Firestore Database** → Créer une base → région `europe-west` → mode production
3. Onglet **Règles** → coller le contenu de `firestore.rules` → Publier
4. ⚙️ **Paramètres du projet** → Vos applications → icône **Web `</>`** → enregistrer → copier l'objet `firebaseConfig`
5. Coller ces valeurs dans **`src/firebase.js`** à la place des `A_REMPLIR`

> Pas besoin d'activer Authentication.

### 2. GitHub + Netlify
1. Créer un dépôt GitHub `groupes-etude` et y envoyer tout le dossier (sans `node_modules` ni `dist`)
2. Netlify → **Add new site → Import from Git** → choisir le dépôt
3. Build command `npm run build`, publish `dist` (déjà dans `netlify.toml`)

### 3. Premier lancement
1. Aller sur `https://ton-site.netlify.app/admin` → PIN par défaut **1234** (défini dans `src/config.js`)
2. **Réglages → changer le PIN** tout de suite
3. **Codes d'accès → Nouveau code** → partager le lien ou le QR code au groupe

## Sécurité
Volontairement minimale (site partagé entre nous) : les règles Firestore sont ouvertes, l'accès est filtré par l'appli (code d'invitation, code perso, PIN admin). Ne pas y mettre d'infos sensibles.

## Données Firestore
| Collection | Contenu |
|---|---|
| `participants` | prénom, nom, code perso, couleur, préférences, créneaux `{d, s, e}` (jour 0=dim, minutes), dates, nb de modifs, code utilisé |
| `invites/{CODE}` | label, actif, expiration, max utilisations, utilisations |
| `polls` | titre, options `{id, date, s, e}`, votes `{participantId: {optionId: yes/maybe/no}}`, statut |
| `sessions` | titre, date, début/fin, format, lieu, participants |
| `logs` | historique de toutes les actions |
| `config/settings` | titre, accueil, code obligatoire, hash du PIN admin |

## Développement local
```bash
npm install
npm run dev
```
