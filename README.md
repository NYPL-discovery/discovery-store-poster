# NYPL Discovery Data Store Poster

Operates in bulk/listener mode to pull bib/item/other data and translate it as a series of statements into a centeral data store.

## Usage

The following describes how to set up your environment, create a test event, run the app against that event using `node-lambda`, and deploy the app to AWS.

### Setup

Before one can run or deploy, one needs to do two things:

1. Ensure `nypl-digital-dev` and `nypl-sandbox` profiles are registered in `~/.aws/credentials` and `~/.aws/config`
2. Obtain environment secrets from a colleague to initialize an environment file as follows:
  * `cp config/qa-sample.env config/qa.env`
  * `cp config/production-sample.env config/production.env`
  * Fill in missing secrets in both environment files

Note, the `DISCOVERY_STORE_CONNECTION_URI` variable should be encrypted. If you have the plaintext connection string, you can encrypt it using the aws cli:

```
aws kms encrypt --key-id "[arn for 'lambda-rds' key]" --plaintext "[plaintext connection string]"
```

### Creating a Test Event

Run this to generate `event.bibs.json` full of encoded bibs:

`node kinesify-data.js event.unencoded.bibs.json event.json https://platform.nypl.org/api/v0.1/current-schemas/Bib`

Or run this to generate `event.items.json` full of encoded items:

`node kinesify-data.js event.unencoded.items.json event.json https://platform.nypl.org/api/v0.1/current-schemas/Item`

Alternatively, to generate a event.json from a plain marcinjson document (such as retrieved from the sierra api), you can kinesify that directly:

`node kinesify-data test/data/bib-10011745.json event.json  https://platform.nypl.org/api/v0.1/current-schemas/Bib`

The `event.json`s generated above will be used when running any version of `npm run run-[environment]` that follow.

### Running Locally

This will run the lambda locally using secrets in `config/qa.env` and one's `nypl-sandbox` profile:

`npm run run-qa`

This will run the lambda locally using secrets in `config/production.env` and one's `nypl-digital-dev` profile:

`npm run run-production`

## Development
The PCDM Store Updater uses field mapping files in `nypl-core` to determine which fields in the MarcInJSON file to
save — and how to record them — in the PCDM store. So while we run tests to check that the metadata is correct in this
app, a lot of the actual data is controlled by `field-mapping-bib.json` and `field-mapping-item.json` in `nypl-core`. 
In order to control which version of these files we use, we tag different versions of `nypl-core` and
specify the tag to link to via the `nyplCoreMappings.version_tag` variable in `config/default.json`.

## Testing

```
npm test
```

## Initializing a New Environment

When a brand new environment is created, you'll need to initialize the DB environment.

To verify that you've entered your encrypted creds correctly and that KMS is able to decrypt them to DB credentials, run the following:

```
node jobs/init.js check --envfile config/[environment].env --profile [aws profile]
```

If no errors are thrown, and the reported creds look correct, proceed with DB creation:

The following will create necessary tables in the DB instance (identified in specified `--envfile`):

```
node jobs/init.js create --envfile config/[environment].env --profile [aws profile]
```

To verify that the serialization works on a sample document, you can run the following:

```
npm run run-[environment]
```

## Bulk (non-lambda) Execution

Specialized "job" scripts are available for running this app in bulk against a large local data set. These scripts do not use `node-lambda`.

### Bibs

Processes NYPL Bibs

```
node jobs/update-bibs.js [opts]
```

`Opts` can include:
* `profile`: AWS profile (required)
* `envfile`: Node-lambda .env file containing deployed ENV vars (required)
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
* `profile`: AWS profile (required)
* `envfile`: Node-lambda .env file containing deployed ENV vars (required)
* `offset`: Start at index
* `limit`: Limit to this number of records
* `uri`: Process specific bib (from cache)
* `loglevel`: Specify log level (default info)
* `threads`: Specify number of threads to run it under
* `disablescreen`: If running multi-threaded, disables default screen takeover


