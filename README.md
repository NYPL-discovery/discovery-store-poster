# NYPL Discovery Data Store Poster

Operates in bulk/listener mode to pull bib/item/other data and translate it as a series of statements into a centeral data store.

## Usage

The following describes how to set up your environment, create a test event, run the app against that event using `node-lambda`, and deploy the app to AWS.

### Setup

Before one can run or deploy, one needs to do two things:

1. Ensure `nypl-digital-dev` and `nypl-sandbox` profiles are registered in `~/.aws/credentials` and `~/.aws/config`
2. Obtain environment secrets from a colleague to initialize an environment file as follows:
  * `cp config/sample.env config/qa.env`
  * `cp config/sample.env config/production.env`
  * Fill in missing secrets in both environment files

Note, the `DISCOVERY_STORE_CONNECTION_URI` variable should be encrypted. See [NYPL notes on encrypting secrets on the command line](https://github.com/NYPL/engineering-general/blob/master/security/secrets.md#using-the-aws-command-line) for more information.

### Verifying your configuration

It can be useful to inspect the configuration represented by different env files - as a sanity check before running a command. The following displays the decrypted configuration from the given env file:

`node jobs/init check --envfile [path to env file] --profile [aws profile]`

### Creating a Test Event

Test event json files can be generated to emulate lambda invocations locally.

Run this to generate `event.json` full of encoded bibs:

`node kinesify-data.js event.unencoded.bibs.json event.json https://platform.nypl.org/api/v0.1/current-schemas/Bib --envfile [path to env file] --profile [aws profile]`

Or run this to generate `event.json` full of encoded items:

`node kinesify-data.js event.unencoded.items.json event.json https://platform.nypl.org/api/v0.1/current-schemas/Item --envfile [path to env file] --profile [aws profile]`

Alternatively, to generate a event.json from a plain marcinjson document (such as retrieved from the sierra api), you can kinesify that directly:

`node kinesify-data test/data/bib-10011745.json event.json  https://platform.nypl.org/api/v0.1/current-schemas/Bib --envfile [path to env file] --profile [aws profile]`

Either of the `event.json`s generated above can be processed against QA infrastructure like this:

`npm run run-qa`

### Directly Serializing a Specific Bib/Item Id

A simple CLI exists allowing you to run the app against a specific single bib or item id. When invoked in this way, the app will query the bib/item data it needs against the platform API and write the result to the configured database.

To get started, you'll need to initialize a local env file containing the db & API credentials you want:

```
cp config/sample-with-api-credentials.env config/production-api-qa-db.env
```

Presumably, `config/production-api-qa-db.env` will contain *production* platform API credentials and *QA* DB credentials, so get those from a co-worker.

The following will fetch bib "b10001936" from the platform API and write it to the configured database.

```
node jobs/update-bibs --bnum b10001936 --profile nypl-sandbox --envfile config/production-api-qa-db.env --loglevel info
```

Equlivalently, one can update a single item by inumber:

```
node jobs/update-items --inum i10003973 --profile nypl-sandbox --envfile config/production-api-qa-db.env --loglevel info
```

Updating Columbia and Princeton items by the same mechanism is accomplished by preceding bnum/inum with 'c' and 'p', respectively. For example, this will process Princeton bib "176961":

```
node jobs/update-bibs --bnum pb176961 --profile nypl-sandbox --envfile config/production-api-qa-db.env --loglevel info
```

## Git & Deployment Workflow

`master` has the lastest-and-greatest commits, `production` should represent what's in our production environment. Because we deploy often, master and production will often be in parity.

### Ideal Workflow

 - Cut a feature branch off of master.
 - Commit changes to your feature branch.
 - File a pull request against master and assign reviewers.
 - After the PR is accepted, merge into master.
 - As necessary, you can `node-lambda deploy` the `master` branch to QA to test on sandbox infrastructure
 - Merge / promote master into production and push to origin.
 - Deploy to production when appropriate (Ideally very soon)

### Release Tags

We're still discussing how and when we want to create release tags. We're dedicated to:

 - Making sure release tag version mirrors the app version in package.json.
 - Bumping that version on each deployment.

### NYPL Core changes

The PCDM Store Updater uses field mapping files in `nypl-core` to determine which fields in the MarcInJSON file to save — and how to record them — in the PCDM store. So while we run tests to check that the metadata is correct in this app, a lot of the actual data is controlled by `field-mapping-bib.json` and `field-mapping-item.json` in `nypl-core`. In order to control which version of these files we use, we tag different versions of `nypl-core` and specify the tag to link to via the `NYPL_CORE_VERSION` variable (e.g. "master", "v1.4a").

### Deploying

This component utilizes *two* environments:

 * *QA*: Represented by `qa` branch, deployed to `nypl-sandbox` account with a dedicated RDS instance
 * *Production*: Represented by `production` branch, deployed to `nypl-digital-dev` account with a dedicated RDS instance

To deploy:

```
npm run deploy-[qa/production]
```

## Testing

```
npm test
```

## Initializing a New Deployment Environment

When a brand new environment is created (e.g. creating a new "Development" environment on AWS infrastructure), you'll need to initialize the DB environment.

To verify that you've entered your encrypted creds correctly and that KMS is able to decrypt them to DB credentials, run the following:

```
node jobs/init.js check --envfile config/[environment].env --profile [aws profile]
```

If no errors are thrown, and the reported creds look correct, proceed with DB creation:

The following will create necessary tables in the DB instance (identified in specified `--envfile`):

```
node jobs/init.js create --envfile config/[environment].env --profile [aws profile]
```
