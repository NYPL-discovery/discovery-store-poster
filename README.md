# NYPL Discovery Data Store Poster

Operates in bulk/listener mode to pull bib/item/other data and translate it as a series of statements into a centeral data store.

## Usage

### Bibs

Processes NYPL Bibs

```
node jobs/update-bibs.js [opts]
```

`Opts` can include:
* `offset`: Start at index
* `limit`: Limit to this number of records
* `skip`: Skip this many (useful if starting offset unknown)
* `seek`: Skip everything except this id (useful id is known to exist insource, but offset not known)
* `until`: Stop after processing this offset
* `uri`: Process specific bib (from cache)
* `loglevel`: Specify log level (default info)
* `threads`: Specify number of threads to run it under
* `disablescreen`: If running multi-threaded, disables default screen takeover

For example, to process the first 100 records with verbose debug output:

```
node jobs/update-bibs.js --limit 100 --loglevel debug
```

### Items

Processes NYPL Items

```
node jobs/update-items.js [opts]
```

`Opts` can include:
* `offset`: Start at index
* `limit`: Limit to this number of records
* `uri`: Process specific bib (from cache)
* `loglevel`: Specify log level (default info)
* `threads`: Specify number of threads to run it under
* `disablescreen`: If running multi-threaded, disables default screen takeover

## Other things (vocabs, etc)

Processes other kinds of NYPL data. This script ingests records from flat jsonld files in the ./data directory.

```
node jobs/update-vocab [name] [opts]
```

`name` should be one of: 'locations', 'statuses', 'organizations', 'datasources', 'accessmessages', 'catalogitemtypes'

`Opts` can include:
* `offset`: Start at index
* `limit`: Limit to this number of records
* `loglevel`: Specify log level (default info)

## AWS Lambda

### node-lambda
The node-lambda npm package is used to invoke the lambda locally and to deploy it to AWS. In order to run the Lambda locally, the following files are needed:
* event.json - can be updated to include a sample Kinesis record to read from when testing locally - optional but useful.
* .env - should be updated to include the AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY credentials and the correct AWS_ROLE_ARN for the Lambda. Add this file to .gitignore.
* deploy.env - should be updated to include the AWS KMS environment variable with the encrypted string, `DISCOVERY_STORE_CONNECTION_URI`, to connect to the AWS RDS discovery_store instance. Add this file to .gitignore.
* Index.js - is the wrapper file and handler that the Lambda uses. This should also include reading the environment variable to decrypt the KMS key.
* post_install.sh - a bash script file executed by node-lambda after it performs `npm install` but before the repo is packaged and pushed to AWS. It is need to copy the static libpq library to the node_modules folder.

To test locally run `node-lambda run -f deploy.env`. The `-f deploy.env` flag will include the `DISCOVERY_STORE_CONNECTION_URI` string needed to connect to the RDS database.

To push to AWS run `node-lambda deploy -f deploy.env`.
