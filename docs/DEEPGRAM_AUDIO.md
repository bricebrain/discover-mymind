# Audio Deepgram dans l’Atelier Discover

## Réglages actifs

Dans l’Atelier, ouvrir **Discover → Voix et budget audio** :

- Moteur **Deepgram Aura-2**, voix **Vesta** par défaut ; **Cora** et **Draco** disponibles.
- Débit par défaut **0,9**, réglable de 0,7 à 1,5. En dialogue, la seconde voix est Draco (Cora si la principale est Draco).
- Plafond initial **10 USD par mois UTC** ; repli sur **Kokoro Heart** si la préparation complète dépasserait le montant restant, si la clé est absente ou si Deepgram échoue.
- Les modifications concernent les prochaines préparations. Elles ne régénèrent pas la bibliothèque ni ne modifient le traitement déjà engagé.

Depuis le 20 octobre 2026, l’Atelier Mac et le parcours sans Mac utilisent Vesta à 0,9× pour les nouvelles générations. Le Mac utilisait auparavant Cora, le cloud Thalia.

Une introduction silencieuse d’environ 650 ms précède la première phrase ; environ 900 ms séparent les paragraphes. Ces pauses sont ajoutées dans le fichier audio, sans appel TTS ni coût supplémentaire, et intégrées au calcul des repères de transcription. Côté cloud, les durées sont arrondies aux trames MP3 (576 échantillons à 22,05 kHz). Les paragraphes existants restent inchangés ; le prompt cloud privilégie désormais des phrases courtes et 350–450 mots pour une source longue.

Les audios existants ne sont pas régénérés. Le cache des fragments Mac reste partagé ; la signature d’assemblage a changé pour prendre en compte les pauses. Le budget et le repli Heart restent inchangés.

## Coût et protection du crédit

Le tarif utilisé pour le calcul est **0,03 USD / 1 000 caractères**, pour Aura-2. Espaces et ponctuation sont inclus ; le comptage UTF-16 est conservateur. Seuls les fragments absents du cache sont estimés. Les doublons entre l’adaptation et la version fidèle ne sont comptés qu’une fois.

Après écriture/contrôle du texte, avant la première synthèse, `audio-estimate.json` garde le coût de la préparation entière, version fidèle comprise. Les estimations récentes apparaissent dans les réglages de l’Atelier. Une préparation trop chère passe intégralement sur Heart avant le premier appel ; chaque appel est ensuite contrôlé de nouveau dans une transaction SQLite.

Le plafond est **local à cet Atelier**, au tarif indiqué : ce n’est ni le solde Deepgram, ni un plafond global du compte. Les dépenses d’EnglishFluency, d’autres clients API et des essais antérieurs à cette intégration ne sont pas incluses. Un changement de tarif fournisseur demanderait une mise à jour du calcul.

Chaque appel est engagé dans le registre **avant** l’envoi HTTP. Aucun réessai payant automatique n’est effectué après un envoi incertain. Les erreurs HTTP, coupures ou réponses audio invalides restent comptées par prudence, même si le fournisseur peut ne pas les facturer. Le repli Heart peut donc suivre un appel partiellement ou potentiellement facturé ; les fragments déjà obtenus restent réutilisables.

Le registre est `convert/fileToImport/.discover-queue/.deepgram/usage.sqlite`, partagé par les préparations Discover de ce Mac. Le cache WAV et ses empreintes sont à côté, dans `cache/`. Ne pas supprimer le registre pour nettoyer le cache : il garde l’historique du plafond et empêche les réessais payants incertains.

## Audio et synchronisation

- Envoi de fragments jusqu’à 1 800 unités UTF-16, en privilégiant les fins de phrase ; aucun changement du texte préparé.
- API REST Aura-2, sortie WAV PCM 16 bits mono, 24 kHz. Redirections HTTP refusées pour ne pas transmettre la clé à un autre hôte.
- Validation du format audio et de l’empreinte de cache ; assemblage par paragraphe avec repères calculés à partir du nombre réel d’échantillons. Les repères sont exacts au niveau des paragraphes, pas des mots.
- Conversion finale MP3 128 kbit/s. Origine et `timingSource` publiées : `deepgram` ; les anciens audios restent `kokoro`.
- Pas de seconde synthèse payante automatique pour forcer une durée cible. Le contrôle existant signale une durée réelle hors cible ; le débit peut être choisi pour les prochaines préparations.

La clé reste dans `convert/config_discover.json` (ignoré par Git, permissions 0600), champ `deepgramApiKey`. Elle n’est jamais renvoyée au navigateur, ni publiée dans le manifeste ou les journaux. Le parcours sans Mac utilise sa propre clé serveur Deepgram dans les secrets du Worker.

## Fichiers et contrat

- `discover_deepgram.py` : découpage, appels HTTP, cache et assemblage PCM.
- `discover_tts_budget.py` : réservations atomiques et suivi mensuel.
- `discover_tts_settings.py` / `discover_tts_ui.js` : configuration privée et interface locale.
- `discover_speech.py` : estimation et choix du moteur pour une préparation ; appel du Kokoro existant en secours.
- `discover_preparation.py` / `discover_podcast_bundle.py` : branchement au pipeline et publication de la véritable origine audio.

Contrats Worker/Python étendus avec la même fixture valide et deux fixtures invalides d’origine/timings incohérents. Migration `0012_deepgram_audio.sql` : reconstruction de `variants` pour élargir ses contraintes, avec copie intégrale des colonnes existantes. Vérification en production : **22 variantes avant et après**, aucune erreur de clé étrangère.

Version Worker déployée : `984a8b20-6fc2-4e9c-9429-de8ffcd44773`.

## Validation

- 61 tests Discover de l’Atelier, dont 16 nouveaux : plafond, concurrence, changement de mois, coût de la version fidèle, cache, reprise incertaine, erreur réseau, repli, horodatage et confidentialité des réglages.
- 224 tests Worker au total : suite de 223 réussie, puis cas supplémentaire de publication Deepgram complète réussi avec les 23 tests de publication. TypeScript Worker et PWA réussis.
- Migration testée avec une variante existante renseignée, comparée colonne par colonne après bascule.
- Essai réel sur le paragraphe de comparaison : **21,35 s d’audio en 10,434 s**, **0,00969 USD engagé**. Deuxième passage : **0,002 s**, aucun nouvel appel ni coût supplémentaire. Cet essai est inclus dans le compteur local ; aucun contenu d’essai n’a été publié.
- Interface de l’Atelier vérifiée dans le navigateur : Cora, plafond de 10 USD, compteur, repli Heart et enregistrement des réglages. Préparateur relancé sur le port local habituel, sans traitement actif interrompu.

Sources : [tarifs Deepgram](https://deepgram.com/pricing), [API de synthèse](https://developers.deepgram.com/reference/text-to-speech/speak-request).
