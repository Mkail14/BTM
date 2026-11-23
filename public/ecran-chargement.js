// Écran de chargement (téléphone) : le logo se remplit au rythme du chargement, puis l'écran s'efface quand le site est prêt.
// Fichier à part et non script dans la page : la politique de sécurité du site (vercel.json, script-src 'self')
// bloque les scripts écrits dans le HTML. Chargé sans defer : il s'exécute avant l'application.
// Le remplissage dure toujours un minimum (plus long à la première visite de la session) : même quand le site
// est prêt tout de suite, on voit le logo se remplir au lieu d'un éclair.
(function () {
  var ecran = document.getElementById('ecran-chargement')
  try {
    if (!window.matchMedia('(max-width: 639px)').matches) {
      ecran.remove()
      window.__btmPret = window.__btmProgres = function () {}
      return
    }
    document.documentElement.classList.add('chargement')
    var premiereVisite = true
    try { premiereVisite = !sessionStorage.getItem('btm-accueilli'); sessionStorage.setItem('btm-accueilli', '1') } catch (e) {}
    var dureeMin = premiereVisite ? 1600 : 900
    var debut = Date.now()
    // Remplissage : chaque étape réelle (script, page, polices, 3D) fixe un palier ; entre deux paliers
    // le logo monte doucement sans jamais l'atteindre, pour ne pas sembler figé.
    var progres = 0, palier = 0.15
    // le logo ne monte jamais plus vite que la durée minimale (courbe qui ralentit en arrivant en haut)
    function rampe() { var t = Math.min(1, (Date.now() - debut) / dureeMin); return 1 - Math.pow(1 - t, 2) }
    function dessiner() { ecran.style.setProperty('--p', Math.min(progres, rampe()).toFixed(3)) }
    var glissement = setInterval(function () { if (progres < 1) progres += (palier - progres) * 0.08; dessiner() }, 80)
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
      progres = 1
      dessiner()
      // le logo finit de se remplir (durée minimale, puis fin de la transition), puis l'écran s'efface
      setTimeout(function () {
        clearInterval(glissement)
        dessiner()
        ecran.classList.add('fini')
        // la barre de défilement revient pendant le fondu : le léger décalage reste masqué par l'écran
        document.documentElement.classList.remove('chargement')
        setTimeout(function () { ecran.remove() }, 800)
      }, Math.max(0, dureeMin - (Date.now() - debut)) + 500)
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
