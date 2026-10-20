# Podcasts sans Mac

Depuis un épisode de podcast : **Préparer en anglais → Préparer sans Mac**.
Le bouton **Préparer sur le Mac** conserve les options et le traitement local existants.

Le parcours cloud accepte un épisode connu de Discover, avec une durée renseignée de
10 secondes à 30 minutes et une URL audio publique HTTPS. Le serveur audio doit annoncer
une taille de 80 Mo maximum et un format audio reconnu. Les redirections sont validées.
Les sources possédant déjà une version préparée restent réservées au parcours Mac.

L'audio officiel est transféré en streaming dans R2 puis dans Gemini Files, sans cookies
ni clé fournisseur transmis à l'éditeur. Gemini transcrit l'audio, adapte l'essentiel en
anglais au niveau choisi et contrôle séparément le résultat. Deepgram produit la voix.
La version finale rejoint l'épisode et la Bibliothèque avec les timings de l'audio généré.
La transcription originale demeure explicitement non vérifiée.

La cible reste une narration d'environ 4 minutes, avec traduction française. Le dialogue,
la copie audio originale et la traduction fidèle intégrale restent sur le Mac.
Les plafonds existants sont conservés : 1 USD réservé par demande, 10 USD/mois par défaut,
trois générations Gemini maximum et aucune nouvelle tentative payante automatique.
La limite d'entrée de 300 000 tokens s'applique également à l'audio du podcast.

Après succès, le fichier audio de travail est supprimé de Google et de R2. En cas d'échec,
les fichiers Google expirent selon la rétention Files API et le nettoyage R2 existant
s'applique après trente jours. Un nettoyage indisponible n'invalide pas une publication.
Aucune nouvelle clé, dépendance ou migration n'est nécessaire.

Références : [audio Gemini](https://ai.google.dev/gemini-api/docs/audio),
[transfert Files API](https://ai.google.dev/gemini-api/docs/files).

Les tests simulent les fournisseurs et exécutent le Workflow jusqu'à la publication,
au rattachement de l'épisode et au nettoyage. La qualité réelle de transcription et de
prononciation reste à vérifier depuis l'app ; aucun appel IA payant n'est lancé par ces tests.
