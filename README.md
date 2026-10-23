# Mölkky VR

Projet ST2AWD – WebXR (Efrei Paris, 2026-2027).
Le jeu de Mölkky en solo, en réalité virtuelle dans le navigateur : on saisit le mölkky avec une manette, on le lance d'un geste réel et on doit atteindre **exactement 50 points**.

Technologies : **A-Frame 1.8** (three.js r184) pour la scène WebXR, **cannon-es 0.20** pour la physique. Aucune autre dépendance, aucun fichier audio ni image externe : sons, textures et panneaux sont générés au chargement.

> Équipe : *(à compléter : noms des 4 ou 5 membres)*

---

## Lancer le jeu

WebXR exige un contexte sécurisé (`https://` ou `http://localhost`). Il faut donc servir le dossier, pas l'ouvrir en double-cliquant.

**Sur ordinateur (mode bureau, sans casque)**

```bash
cd molkky-vr
python -m http.server 8000      # ou : npx serve .
```

Puis ouvrir `http://localhost:8000` dans Chrome, Edge ou Firefox.

**Sur casque (Meta Quest)** — attention : ouvrir `http://192.168.x.x:8000` (l'adresse du PC sur le réseau) dans le casque **ne marche pas**. Le navigateur du Quest désactive WebXR sur une page `http://` qui n'est pas `localhost` : on voit la scène, on peut cliquer, mais les manettes ne sont pas suivies et on ne peut pas lancer. Le jeu l'affiche désormais dans un encadré rouge. Trois possibilités :

1. **GitHub Pages** (le plus simple pour la démo) : pousser le dossier sur un dépôt, activer Pages, ouvrir l'URL `https://…github.io/…` dans le navigateur du Quest.
2. **Câble USB + adb** : `adb reverse tcp:8000 tcp:8000`, puis ouvrir `http://localhost:8000` dans le navigateur du Quest (localhost est considéré comme sécurisé).
3. **Quest Link / Air Link** : ouvrir `http://localhost:8000` dans Chrome sur le PC et cliquer sur le bouton VR.

Les bibliothèques et les polices sont embarquées dans `lib/` et `assets/` : le jeu fonctionne sans connexion. Seuls les modèles 3D des manettes sont téléchargés depuis le CDN d'A-Frame (sans réseau, les manettes ne s'affichent pas mais le jeu reste jouable).

## Commandes

| Action | Casque VR | Mode bureau |
|---|---|---|
| Cliquer un bouton | viser au laser + **gâchette** | **clic** souris |
| Saisir le mölkky | main près du bâton + **grip** (ou gâchette) ; ou le viser au laser + grip | automatique |
| Orienter | tourner la manette en le tenant ; passer d'une main à l'autre avec le grip de l'autre main | — |
| Lancer | balancer le bras et **relâcher** le bouton | **Espace** ou bouton **LANCER** maintenu pour doser, relâcher pour lancer |
| Viser | geste réel | glisser la souris |
| Recommencer | panneau « Partie » à droite | panneau ou touche **R** |
| Menu principal | panneau, ou bouton **B / Y** | panneau ou touche **M** |
| Diagnostic | bouton **X** (manette gauche) | ajouter `?debug` à l'adresse |

### Saisir, orienter, lancer (manettes VR)

C'est l'exigence centrale du sujet ; voici ce que fait `js/hands.js` :

1. **Saisir** — le mölkky attend sur un tabouret placé à portée de main (il se replace à côté du joueur à chaque lancer, du côté de la main qui a lancé). Quand une main arrive à moins de 20 cm du bâton, il s'illumine et la manette vibre légèrement : **grip** (ou gâchette) le saisit **à l'endroit touché, dans l'orientation où il était**. Main trop loin : rien ne se passe (petite vibration « non »). Pour jouer assis, on peut aussi le **viser au laser** et serrer : il vient dans la main.
2. **Orienter** — tant que le bouton est maintenu, le bâton suit la position **et la rotation** de la manette : on peut le tenir à plat, debout, par un bout… Le grip de l'autre main le fait passer d'une main à l'autre.
3. **Lancer** — au relâchement, le mölkky part avec la **vitesse et la direction du mouvement de la main**, mesurées sur les dernières positions réellement suivies du bâton, ainsi qu'avec la **rotation de la main** (vitesse angulaire). Un poignet qui tourne fait donc tournoyer le bâton, ce qui change la façon dont il percute les quilles. Un lâcher plus lent que 0,7 m/s est considéré comme accidentel : le lancer est annulé et ne compte pas.

Le mode bureau (souris, Espace, bouton LANCER) n'existe que pour tester et faire la démonstration sans casque.

## Montrer au public ce que voit le joueur

- **Casque branché au PC (Quest Link ou Air Link), jeu ouvert dans Chrome ou Edge sur le PC** : pendant la VR, la page du PC affiche automatiquement la vue du joueur (composant `mk-spectator`, `js/spectator.js`). Elle est rendue en 1280 px au plus et légèrement lissée pour ne pas donner le mal de mer au public. On peut la couper avec `?miroir=0` dans l'adresse, ou pendant la partie avec le bouton **A** de la manette droite.
- **Jeu ouvert directement dans le navigateur du casque (sans PC)** : la page du PC est une autre copie du jeu et ne peut rien montrer. Il faut utiliser la diffusion du Quest : bouton « Diffuser » du casque vers l'appli Meta Horizon du téléphone, ou vers la page de diffusion Meta ouverte dans Chrome sur le PC.

## Dépannage dans le casque

- **Encadré rouge « Mode casque indisponible »** : la page n'est pas sécurisée, voir « Lancer le jeu ».
- **Rien ne se passe au grip** : approcher la main du bâton (il doit briller franchement) ou le viser au laser. Sinon, appuyer sur **X** (manette gauche) ouvre un panneau de diagnostic devant les yeux. Il affiche le mode (casque ou écran), la phase du jeu, qui tient le mölkky, le résultat de la dernière tentative de saisie, les dernières touches reçues par chaque manette et la vitesse mesurée au dernier lâcher. Si une erreur survient, elle y apparaît en rouge et le panneau s'ouvre tout seul.
- **« TROP DOUX »** : le geste était plus lent que 0,7 m/s ; le lancer ne compte pas, il suffit de recommencer plus franchement.

## Règles implémentées

- 12 quilles numérotées, en formation officielle (rangées 1-2 / 3-10-4 / 5-11-12-6 / 7-9-8), planche de lancer à 2,5 / 3,5 / 4,5 m selon le niveau.
- **Une seule quille tombée** : on marque son numéro. **Plusieurs** : on marque leur nombre. **Aucune** : 0 point.
- Une quille ne compte que si elle est **réellement tombée** : son axe fait plus de 65° avec la verticale une fois que tout est immobile. Une quille qui a seulement vacillé ou qui reste appuyée sur une autre ne compte pas.
- Après le calcul, chaque quille tombée est **relevée à l'endroit où elle est tombée** (décalée de quelques centimètres si elle chevauche une autre quille, ramenée dans le terrain si elle est sortie). Les quilles se dispersent donc au fil de la partie.
- Plus de 50 : **retour à 25**. Exactement 50 : **victoire**. Trois lancers de suite sans point : **défaite**.

## Niveaux de difficulté

| Niveau | Distance | Assistance |
|---|---|---|
| Facile | 2,5 m | trajectoire prédite en pointillés + anneau au point d'impact + ligne de visée au sol + la quille qui donne la victoire (≤ 12 points restants) clignote |
| Normal | 3,5 m | aucune (paramètres standards) |
| Difficile | 4,5 m | aucune |

La trajectoire affichée en Facile utilise la même gravité et le même amortissement que le moteur physique : elle a été comparée à la trajectoire réelle (écart mesuré de 1 à 2 cm pendant le vol).

## Interface

Tous les panneaux sont des objets de la scène (panneaux en bois plantés dans l'herbe), lisibles en VR et cliquables au laser :

- **Menu** : choix du niveau, nouvelle partie, record du niveau choisi.
- **Tableau des scores** : score actuel, points restants, numéro du lancer, points du dernier lancer (et quilles concernées), échecs consécutifs (3 cases), chronomètre, quatre derniers lancers.
- **Panneau « Partie »** à portée de main : recommencer, revenir au menu.
- **Messages** au-dessus du terrain : `+7 / Quille n° 7`, `RATÉ / échec 2 sur 3`, `TROP ! / 53 dépasse 50 : retour à 25`, `50 PILE !`, `PERDU`.
- **Fin de partie** : victoire ou défaite, score final, nombre de lancers, temps total, record (« Nouveau record » le cas échéant) et tableau des lancers.

## Sons 3D

Tous les sons sont synthétisés au démarrage (Web Audio) puis joués par des sources `THREE.PositionalAudio` avec un panner **HRTF**, placées à l'endroit de l'événement : sifflement du lancer à la main, choc du mölkky sur les quilles, bruit sourd sur l'herbe, claquement entre quilles, chute de chaque quille, petites mélodies de marimba pour les points, l'échec, le dépassement, la victoire et la défaite. Le volume des chocs dépend de la vitesse d'impact.

## Données

Chaque lancer produit un enregistrement :

```json
{
  "throwNumber": 7,
  "fallenPins": [3, 9, 11],
  "points": 3,
  "scoreBefore": 41,
  "totalScore": 44,
  "overflow": false,
  "misses": 0,
  "outcome": "points",
  "elapsedMs": 152300
}
```

`localStorage` (clé `molkky-vr.records.v1`) conserve :

```json
{
  "version": 1,
  "best": { "facile": {…}, "normal": {…}, "difficile": null },
  "last": { "difficulty": "normal", "result": "win", "score": 50, "throws": 14, "timeMs": 201000, "date": "…", "history": [ … ] },
  "gamesPlayed": 6
}
```

Le **meilleur résultat** est gardé par niveau : une victoire bat toujours une défaite, puis le moins de lancers, puis le temps le plus court (entre deux défaites : le meilleur score). En mode bureau, un bouton permet d'exporter la dernière partie en JSON. Chaque lancer est aussi tracé dans la console (`[Mölkky] lancer {…}`).

## Architecture

```
molkky-vr/
├── index.html          scène A-Frame + surcouche bureau
├── css/style.css       surcouche bureau (aide, jauge, chargement)
├── js/
│   ├── config.js       constantes : dimensions, niveaux, réglages physiques, palette
│   ├── debug.js        panneau de diagnostic (bouton X) et protection des boucles
│   ├── rules.js        règles pures (score, 50→25, 3 échecs) — testées avec Node
│   ├── storage.js      meilleur résultat et dernière partie (localStorage)
│   ├── fonts.js        chargement des polices embarquées
│   ├── textures.js     bois, herbe, écorce, ciel générés en canvas
│   ├── physics.js      système mk-physics : monde cannon-es à pas fixe
│   ├── pins.js         composant mk-pin : géométrie biseautée, chute, relevage
│   ├── molkky.js       composant mk-molkky : tabouret / en main / en vol
│   ├── hands.js        composant mk-hand : saisie et lancer aux manettes
│   ├── desktop.js      composant mk-desktop : lancer à la jauge sans casque
│   ├── assist.js       composant mk-assist : trajectoire prédite (Facile)
│   ├── environment.js  pré, allée tondue, arbres instanciés, mökki, tabouret
│   ├── audio.js        système mk-audio : synthèse + sons positionnels HRTF
│   ├── ui.js           panneaux, boutons, messages (canvas → textures)
│   ├── game.js         système mk-game : machine à états de la partie
│   └── spectator.js    composant mk-spectator : vue du joueur sur l'écran du PC
├── lib/                aframe.min.js, cannon-es.min.js (embarqués)
├── assets/fonts/       Alfa Slab One, Barlow Semi Condensed (+ licences OFL)
└── tests/rules.test.js tests des règles et de la sauvegarde
```

**Machine à états** (`game.js`) :

```
menu ──Nouvelle partie──▶ ready ──grip──▶ held ──lâcher──▶ flying ──tout immobile──▶ scoring ──▶ ready …
                            ▲                                                         │
                            └──────────────── quilles relevées ◀───────────────────────┘
                                                     50 pile ou 3 échecs ──▶ ended ──▶ Rejouer / Menu
```

**Points techniques**

- **Physique** : pas fixe de 1/180 s (jusqu'à 10 sous-pas par image) pour que le mölkky, fin et rapide, ne traverse pas les quilles ; interpolation entre deux pas pour un rendu fluide ; mise en veille des corps immobiles pour que la formation reste stable.
- **Vitesse du lancer** : mesurée sur les positions réellement suivies du centre du bâton, relevées après la mise à jour des manettes (`tock`) pour que temps et position concordent : régression linéaire sur les 5 derniers relevés (~55 ms), complétée par le pic des ~110 dernières ms pour un lâcher un peu tardif. La vitesse annoncée par le casque (`XRPose.linearVelocity`) n'est qu'affichée dans le diagnostic : elle est bruitée. La rotation de la main est transmise au mölkky.
- **Robustesse** : chaque boucle (jeu, physique, sons, assistance) est protégée ; une erreur est affichée dans le panneau de diagnostic au lieu de figer l'image du casque. Le mode casque n'est considéré actif que pendant une vraie session WebXR (`renderer.xr.isPresenting`).
- **Fin du lancer** : tous les objets sous 5 cm/s, aucune quille en train de basculer, et le même ensemble de quilles au sol pendant 0,7 s (sécurité : 8 s).
- **Quilles** : géométrie de cylindre modifiée pour obtenir le sommet biseauté portant le numéro (6 et 9 soulignés), texture de bois propre à chaque quille.
- **Performances Quest** : arbres en `InstancedMesh`, ombres sur une zone limitée, textures de panneaux redessinées seulement quand leur contenu change (le chronomètre a sa propre petite texture).

## Tests

```bash
node tests/rules.test.js
```

24 tests : calcul des points, dépassement de 50, victoire, défaite, remise à zéro des échecs, historique, comparaison des records, stockage corrompu.

Le jeu a aussi été vérifié dans Chromium headless : parcours complet au clavier et à la souris, et parcours VR avec l'émulateur WebXR **IWER** (Meta Quest 3 simulé) : clic au laser sur « Nouvelle partie », saisie refusée main trop loin, saisie main proche avec orientation conservée, bâton qui suit la rotation de la manette, passage d'une main à l'autre, lancer de la main gauche (vitesse mesurée 5,6 m/s pour 5,7 m/s attendus), saisie au laser à 1,2 m. Une série de 28 lancers automatiques vérifie aussi la cohérence du score et l'absence de quilles qui se chevauchent après relevage.

## Crédits

- [A-Frame](https://aframe.io) — licence MIT
- [cannon-es](https://github.com/pmndrs/cannon-es) — licence MIT
- Polices [Alfa Slab One](https://fonts.google.com/specimen/Alfa+Slab+One) (JM Solé) et [Barlow Semi Condensed](https://fonts.google.com/specimen/Barlow+Semi+Condensed) (Jeremy Tribby) — SIL Open Font License 1.1, voir `assets/fonts/`
