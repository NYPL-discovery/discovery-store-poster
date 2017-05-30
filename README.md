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

**event.json** - can be updated to include a sample Kinesis record to read from when testing locally - optional but useful.

**.env** - should be updated to include the following:
```
AWS_ENVIRONMENT=
AWS_ACCESS_KEY_ID=[enter key here]
AWS_SECRET_ACCESS_KEY=[enter secret here]
AWS_PROFILE=
AWS_SESSION_TOKEN=
AWS_ROLE_ARN=arn:aws:iam::224280085904:role/lambda_basic_execution
AWS_REGION=us-east-1
AWS_FUNCTION_NAME=discoveryStorePoster
AWS_HANDLER=index.handler
AWS_MEMORY_SIZE=512
AWS_TIMEOUT=15
AWS_DESCRIPTION=
AWS_RUNTIME=nodejs4.3
AWS_VPC=vpc-dbc4f7bc
AWS_VPC_SUBNETS=subnet-f4fe56af
AWS_VPC_SECURITY_GROUPS=sg-1d544067
EXCLUDE_GLOBS="event.json"
PACKAGE_DIRECTORY=build
```

**deploy.env** - should be updated to include the following:
```
DISCOVERY_STORE_CONNECTION_URI=[discovery-store postgres connection string, ecrypted via KMS 'lambda-rds' key]
NYPL_API_BASE_URL=[base url for NYPL data api ending in "/"]
```

To retrieve KMS encrypted values using the AWS cli:
```
aws kms encrypt --key-id "[arn for 'lambda-rds' key]" --plaintext "[plaintext connection string]"
```

**index.js** - is the wrapper file and handler that the Lambda uses. This should also include reading the environment variable to decrypt the KMS key.

To test locally run `node-lambda run -f deploy.env`. The `-f deploy.env` flag will include the `DISCOVERY_STORE_CONNECTION_URI` string needed to connect to the RDS database.

To push to AWS run `node-lambda deploy -f deploy.env`.

### Test Data

The Lambda is set up to read AWS events, one of which is a Kinesis stream. The PCDM Store Updater reads from two Kinesis Streams: Bib and Item. As mentioned above, to test locally run `node-lambda run -f deploy.env`. This will use the `event.json` file as the Kinesis event source. Make sure you update your `config/local.json` file to include the values for the Kinesis streams:

    "kinesisReadStreams": {
      "bib": "arn:aws:kinesis:us-east-1:[AWS-ID]:stream/Bib",
      "item": "arn:aws:kinesis:us-east-1:[AWS-ID]:stream/Item"
    }

*Note: Make sure you update the AWS-ID in the config and in kinesify-data.js*

The script to generate mock data is from [Discovery Bib/Item Poster](https://github.com/NYPL-discovery/discovery-bib-poster).

Run this to generate `event.bibs.json` full of encoded bibs:

    node kinesify-data.js event.unencoded.bibs.json event.bibs.json https://api.nypltech.org/api/v0.1/current-schemas/Bib

Or run this to generate `event.items.json` full of encoded items:

    node kinesify-data.js event.unencoded.items.json event.items.json https://api.nypltech.org/api/v0.1/current-schemas/Item

Alternatively, to generate a event.json from a plain marcinjson document (such as retrieved from the sierra api), you can kinesify that directly:

    node kinesify-data test/data/bib-10011745.json event.json  https://api.nypltech.org/api/v0.1/current-schemas/Bib

Any of the event jsons generated above can be copied to `event.json` to test the lambda locally via `node-lambda run -f deploy.env`.

### Testing

Ensure you have a `deploy.env` and `.env` as described above. Then:

```npm test```
