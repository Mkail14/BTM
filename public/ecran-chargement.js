// Écran de chargement (téléphone) : phrases, ligne de chargement et retrait quand le site est prêt.
// Fichier à part et non script dans la page : la politique de sécurité du site (vercel.json, script-src 'self')
// bloque les scripts écrits dans le HTML. Chargé sans defer : il s'exécute avant l'application.
// Première visite de la session : on laisse le temps de lire « Bienvenue » ; ensuite (rechargements),
// l'écran disparaît dès que le site est prêt.
(function () {
  var ecran = document.getElementById('ecran-chargement')
  try {
    if (!window.matchMedia('(max-width: 639px)').matches) {
      ecran.remove()
      window.__btmPret = window.__btmProgres = function () {}
      return
    }
    document.documentElement.classList.add('chargement')
    var phrases = ecran.querySelectorAll('.phrases span')
    var premiereVisite = true
    try { premiereVisite = !sessionStorage.getItem('btm-accueilli'); sessionStorage.setItem('btm-accueilli', '1') } catch (e) {}
    var dureeMin = premiereVisite ? 1800 : 0
    var debut = Date.now(), dernierChangement = debut, i = 0
    var minuterie = setInterval(function () {
      var sortante = phrases[i]
      sortante.className = 'sortie'
      setTimeout(function () { sortante.className = '' }, 900)
      i = (i + 1) % phrases.length
      phrases[i].className = 'active'
      dernierChangement = Date.now()
    }, 1600)
    // Ligne de chargement : chaque étape réelle (script, page, polices, 3D) fixe un palier ; entre deux paliers
    // la ligne avance doucement sans jamais l'atteindre, pour ne pas sembler figée.
    var barre = ecran.querySelector('.ligne b')
    var progres = 0, palier = 0.15
    function dessiner() { barre.style.transform = 'scaleX(' + progres + ')' }
    var glissement = setInterval(function () { progres += (palier - progres) * 0.08; dessiner() }, 120)
    window.__btmProgres = function (v) {
      if (v <= palier) return
      progres = Math.max(progres, palier * 0.98)
      palier = v
      dessiner()
    }
    var retire = false
    window.__btmPret = function () {
      if (retire) return
      retire = true
      clearInterval(glissement)
      progres = 1
      dessiner()
      setTimeout(function () {
        // une phrase qui vient d'apparaître reste lisible avant le fondu (jamais coupée en pleine entrée)
        clearInterval(minuterie)
        setTimeout(function () {
          ecran.classList.add('fini')
          // la barre de défilement revient pendant le fondu : le léger décalage reste masqué par l'écran
          document.documentElement.classList.remove('chargement')
          setTimeout(function () { ecran.remove() }, 1000)
        }, i === 0 ? 0 : Math.max(0, 900 - (Date.now() - dernierChangement)))
      }, Math.max(500, dureeMin - (Date.now() - debut))) // la ligne a le temps d'arriver au bout
    }
    // filet de sécurité : jamais bloqué derrière l'écran si le site plante au démarrage
    setTimeout(window.__btmPret, 8000)
  } catch (e) {
    // jamais bloqué derrière l'écran : au moindre problème, il disparaît et le site s'affiche
    ecran.remove()
    document.documentElement.classList.remove('chargement')
    window.__btmPret = window.__btmProgres = function () {}
  }
})()
