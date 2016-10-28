#NYPL Discovery PCDM Store Updater

Listens to NYPL's Bibs and Items kafka streams and serializes them into a triplestore-ish mongo db.

```
node jobs/update-bibs.js [--limit LIMIT] [--offset OFFSET] [--uri BIBURI]
node jobs/update-items.js [--limit LIMIT] [--offset OFFSET] [--uri ITEMURI]
node jobs/update-locations.js
```
