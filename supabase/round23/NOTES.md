# Round 23 (applied live; tested with a rolled-back test)
- desktop_releases.platform now allows android and ios (additive).
- businesses.theme jsonb (default {}), set_my_theme(jsonb) owner-only with a whitelist (bad keys/values are dropped), my_business_theme().
- Edge functions desktop-setup-link v5 and desktop-ingest v2 accept android/ios; ingest accepts externalUrl (https only) for TestFlight/App Store links.
- Admin: Installers pages list Android and iPhone/iPad.
Not run in a browser or compiled here; GitHub builds for Android/iOS not run.
