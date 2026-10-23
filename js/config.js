/* =========================================================================
 * Mölkky VR — configuration globale
 * Toutes les constantes du jeu sont regroupées ici : dimensions réelles
 * (en mètres), réglages physiques, niveaux de difficulté et palette.
 * ========================================================================= */
window.MK = window.MK || {};

MK.CONFIG = {
  // Quille : cylindre en bouleau, sommet biseauté portant le numéro.
  pin: {
    radius: 0.03,
    height: 0.17,
    slant: 0.035,        // hauteur du biseau (avant plus bas que l'arrière)
    mass: 0.22,
    segmentsPhysics: 10,
    segmentsVisual: 28
  },

  // Bâton de lancer (le « mölkky »).
  molkky: {
    radius: 0.029,
    length: 0.23,
    mass: 0.36
  },

  // Position de la planche de lancer (le joueur se tient derrière, z > 0).
  throwLineZ: -0.5,

  // Niveaux de difficulté : distance planche -> première rangée de quilles.
  difficulties: {
    facile: {
      id: 'facile',
      label: 'Facile',
      distance: 2.5,
      assist: true,
      detail: '2,5 m, trajectoire affichée'
    },
    normal: {
      id: 'normal',
      label: 'Normal',
      distance: 3.5,
      assist: false,
      detail: '3,5 m, réglages standards'
    },
    difficile: {
      id: 'difficile',
      label: 'Difficile',
      distance: 4.5,
      assist: false,
      detail: '4,5 m, aucune aide'
    }
  },
  defaultDifficulty: 'normal',

  // Terrains : contact sol / bois et roulement des quilles et du mölkky.
  // rolling multiplie l'amortissement de rotation des corps (résistance au roulement).
  // groundDrag (par seconde) freine en plus tout ce qui touche le sol (terrain meuble).
  // settleDrag (par seconde) freine ce qui est presque arrêté au sol : évite qu'une
  // quille couchée tremble sans fin sur un sol dur et rebondissant.
  // sound règle le bruit des impacts au sol (vitesse de lecture, volume).
  terrains: {
    herbe: {
      id: 'herbe',
      label: 'Herbe',
      friction: 0.55,
      restitution: 0.14,
      rolling: 1,
      groundDrag: 0,
      settleDrag: 0,
      sound: { rate: 1, volume: 1 }
    },
    sable: {
      id: 'sable',
      label: 'Sable',
      friction: 0.9,
      restitution: 0.02,   // presque aucun rebond
      rolling: 2,
      groundDrag: 6,       // le sable retient : les quilles s'arrêtent presque aussitôt
      settleDrag: 0,
      sound: { rate: 0.7, volume: 0.45 }
    },
    beton: {
      id: 'beton',
      label: 'Béton',
      friction: 0.3,
      restitution: 0.5,    // ça rebondit
      rolling: 0.3,        // et ça roule loin
      groundDrag: 0,
      settleDrag: 6,
      sound: { rate: 1.5, volume: 1.3 }
    }
  },
  defaultTerrain: 'herbe',

  // Une quille est « tombée » quand son axe dépasse cet angle avec la verticale.
  fallenTiltDeg: 65,

  // Détection de fin de lancer : tout doit être immobile pendant holdMs.
  settle: {
    linear: 0.05,       // m/s : plus aucun objet ne se déplace
    angular: 1.0,       // rad/s : aucune quille n'est en train de basculer
    holdMs: 700,        // ... pendant 0,7 s avec les mêmes quilles au sol
    minMs: 900,         // durée minimale après le lâcher
    timeoutMs: 8000     // sécurité si un objet roule indéfiniment
  },

  // Lancer
  throw: {
    minSpeed: 0.7,      // en dessous : lâcher accidentel, lancer annulé
    maxSpeed: 13,
    vrBoost: 1.1,       // léger gain : la mesure est un peu en retard sur la main
    desktopMinSpeed: 2.4,
    desktopMaxSpeed: 8.6
  },

  // Limites du terrain dans lesquelles les quilles sont remises debout.
  field: {
    halfWidth: 3.2,
    backMargin: 3.0,    // derrière la dernière rangée initiale
    frontGap: 0.9       // distance minimale avec la planche de lancer
  },

  physics: {
    gravity: -9.82,
    step: 1 / 180,
    maxSubSteps: 10
  },

  // Palette relevée sur les objets de la scène (bois, herbe, mökki rouge).
  palette: {
    koivu: '#E8D2A6',      // bouleau : quilles, texte clair
    manty: '#B9814A',      // pin : mölkky, cadres
    terva: '#2A1E16',      // goudron : encre, ombres, intérieur des boutons
    metsa: '#2F4A2A',      // vert forêt : peinture des panneaux
    nurmi: '#7FA347',      // herbe : points marqués
    punamulta: '#B5412E',  // rouge de Falun : échecs, défaite
    kulta: '#F2B544'       // soleil du soir : sélection, victoire
  },

  storageKey: 'molkky-vr.records.v1'
};
