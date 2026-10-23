# Mölkky VR

Jeu de **Mölkky** en réalité virtuelle, directement dans le navigateur (WebXR + A-Frame).
On lance un bâton de bouleau sur douze quilles numérotées, dans un pré finlandais un soir d'été, avec pour objectif d'atteindre **exactement 50 points**.

Le jeu fonctionne avec un casque VR (Meta Quest ou tout casque compatible WebXR) et aussi sur un simple écran, à la souris, au clavier ou au doigt.

## Règles

- **Une seule quille tombée** : elle rapporte sa valeur (de 1 à 12).
- **Plusieurs quilles tombées** : on marque le nombre de quilles tombées.
- **Plus de 50 points** : le score retombe à **25**.
- **Trois lancers ratés de suite** (aucune quille tombée) : la partie est perdue.
- Les quilles tombées sont relevées là où elles sont tombées, comme dans le vrai jeu.

Les quilles commencent dans la formation officielle :

```
      7  9  8
    5 11 12  6
      3 10  4
        1  2
   ── planche de lancer ──
```

### Niveaux de difficulté

| Niveau    | Distance | Aide                                                     |
|-----------|----------|----------------------------------------------------------|
| Facile    | 2,5 m    | trajectoire prédite, point d'impact et ligne de visée    |
| Normal    | 3,5 m    | aucune                                                   |
| Difficile | 4,5 m    | aucune                                                   |

Le meilleur résultat de chaque niveau est enregistré dans le navigateur. Une victoire bat toujours une défaite ; entre deux victoires, le moins de lancers l'emporte, puis le temps le plus court. L'historique complet de la dernière partie peut être exporté en `.json`.

## Commandes

### Avec un casque

- **Saisir** : approcher la main du mölkky (posé sur le tabouret) puis appuyer sur **grip** ou **gâchette**. On peut aussi le viser au laser et serrer : il vient dans la main.
- **Orienter** : tant que le bouton est maintenu, le bâton suit la position et la rotation de la manette ; il peut changer de main.
- **Lancer** : faire le geste et relâcher. La vitesse et la rotation de la main sont transmises au bâton.
- **Boutons des panneaux** : pointer au laser et appuyer sur la gâchette.
- **B / Y** : retour au menu.
- **X** : panneau de diagnostic.

### Sans casque

| Action                     | Commande                                          |
|----------------------------|---------------------------------------------------|
| Viser                      | glisser avec la souris                            |
| Doser puis lancer          | maintenir **Espace**, relâcher pour lancer        |
| Lancer (souris / tactile)  | maintenir le bouton **LANCER**, relâcher          |
| Boutons des panneaux       | clic                                              |
| Recommencer la partie      | **R**                                             |
| Revenir au menu            | **M**                                             |

## Lancer le jeu

Le projet est entièrement statique : aucune installation ni compilation. A-Frame, cannon-es et les polices sont embarqués dans le dépôt, le jeu fonctionne donc hors ligne.

### Sur ordinateur

Servir le dossier avec n'importe quel serveur HTTP, par exemple :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>. (Ouvrir `index.html` directement en `file://` peut empêcher le chargement des polices.)

### Dans un casque

WebXR n'est autorisé que sur une page **sécurisée** : `https://` ou `http://localhost`. Une adresse réseau du type `http://192.168.x.x` affichera le jeu en mode écran, sans manettes.

Deux solutions :

1. **GitHub Pages** (le plus simple) : dans *Settings → Pages* du dépôt, publier la branche principale (dossier racine). Le jeu est alors accessible en `https://<utilisateur>.github.io/molkky-vr/` depuis le navigateur du casque.
2. **Câble USB + `adb reverse`** : avec le mode développeur activé sur le casque, lancer le serveur local puis rediriger le port :

   ```bash
   python3 -m http.server 8000
   adb reverse tcp:8000 tcp:8000
   ```

   et ouvrir `http://localhost:8000` dans le navigateur du casque.

Ajouter `?debug` à l'adresse ouvre le panneau de diagnostic dès le démarrage.

## Tests

Les règles du jeu et la sauvegarde sont de la logique pure, testée avec Node (aucune dépendance) :

```bash
node tests/rules.test.js
```

## Organisation du code

```
index.html           scène A-Frame, surcouche bureau, détection WebXR
css/style.css        styles de la surcouche (chargement, aide, jauge)
js/config.js         toutes les constantes : dimensions, physique, niveaux, palette
js/rules.js          règles et score (sans 3D, testé sous Node)
js/storage.js        records et dernière partie (localStorage)
js/game.js           machine à états : menu → ready → held → flying → scoring → ended
js/physics.js        monde cannon-es à pas fixe (1/180 s), synchronisé avec la scène
js/pins.js           quilles numérotées, formation, détection de chute, relevage
js/molkky.js         le bâton de lancer
js/hands.js          saisie, orientation et lancer aux manettes
js/desktop.js        mode écran : visée à la souris, jauge de force
js/assist.js         aides du niveau Facile (trajectoire, impact, ligne de visée)
js/environment.js    décor : pré, allée, bouleaux et pins, mökki, planche, tabouret
js/ui.js             panneaux en bois dans la scène (menu, scores, fin de partie)
js/audio.js          sons 3D synthétisés à la volée (aucun fichier audio)
js/textures.js       textures générées dans des canvas
js/fonts.js          chargement des polices embarquées
js/debug.js          panneau de diagnostic et capture des erreurs
lib/                 A-Frame 1.8.0 et cannon-es (versions minifiées)
assets/fonts/        Alfa Slab One et Barlow Semi Condensed (licence OFL)
tests/               tests des règles et de la sauvegarde
```

## Crédits

- [A-Frame](https://aframe.io) — moteur WebXR (licence MIT)
- [cannon-es](https://github.com/pmndrs/cannon-es) — moteur physique (licence MIT)
- Polices [Alfa Slab One](https://fonts.google.com/specimen/Alfa+Slab+One) et [Barlow Semi Condensed](https://fonts.google.com/specimen/Barlow+Semi+Condensed) — SIL Open Font License (voir `assets/fonts/`)
