// Usage:
//    node kinesify-data.js [--opts] [INFILES] [OUTFILE] [SCHEMAURL]
//
//  The following command will take unencoded json, encode it with avro schema, encode it with base64, and put in Kinesis format.
//    node kinesify-data.js event.unencoded.bibs.json
//
//  If infile is a plain marcinjson document, it will be converted into the right form.
//  i.e. You can load sample docs directly from the test data:
//    node kinesify-data test/data/bib-10011745.json
//
//  If you want to load up multiple bibs or items in one event.json (to test batches > 1),
//  infile accepts comma-delimited paths:
//    node kinesify-data test/data/bib-11079574.json,test/data/bib-11253008.json,test/data/bib-10011745.json event.json https://platform.nypl.org/api/v0.1/current-schemas/Bib
//
//  To build an event.json with nypl bib ids (i.e. to debug a failed run on a list of ids):
//    node kinesify-data --ids "[comma delimited nypl bib ids]" [--nyplType bib/item]
//    e.g.
//    node kinesify-data --ids "15796439, 15796440, 15796449, 15796502"

const avro = require('avsc')
const fs = require('fs')
const request = require('request')
const NYPLDataApiClient = require('@nypl/nypl-data-api-client')
const argv = require('minimist')(process.argv.slice(2), {
  string: ['ids'],
  default: {
    nyplType: 'bib'
  }
})

// config
const infile = argv._[0]
const outfile = argv._[1] || 'event.json'
var schemaUrl = argv._[2]

// Correct common record issues (e.g. missing fields)
function fixRecord (record) {
  if (record.nyplType === 'bib') return fixBib(record)
  if (record.nyplType === 'item') return fixItem(record)
  if (!record.nyplType) console.error('Must set nyplType')
  return record
}

function fixItem (item) {
  // If fixedFields is an array, make it a hash:
  if (Array.isArray(item.fixedFields)) {
    item.fixedFields = Object.keys(item.fixedFields).reduce((h, ind) => {
      h[`${ind}`] = item.fixedFields[ind]
      return h
    }, {})
  }
  return item
}

function fixBib (bib) {
  bib.varFields = (bib.varFields || []).map((field) => {
    // Assign following fields to null if not otherwise set:
    field = ['content', 'display', 'ind1', 'ind2', 'marcTag'].reduce((f, prop) => f[prop] ? f : Object.assign(f, { [prop]: null }), field)

    return field
  }, {})

  bib.fixedFields = Object.keys(bib.fixedFields).reduce((h, ind) => {
    var field = bib.fixedFields[ind]
    if (!field.display) field.display = null
    h[`${ind}`] = field
    return h
  }, {})

  if (typeof bib.fixedFields.length === 'number') {
    bib.fixedFields = Object.keys(bib.fixedFields).reduce((h, ind) => {
      h[`${ind}`] = bib.fixedFields[ind]
      return h
    }, {})
  }

  bib = ['deletedDate', 'locations', 'normTitle', 'normAuthor'].reduce((f, prop) => f[prop] ? f : Object.assign(f, { [prop]: null }), bib)
  if (!bib.nyplSource) bib.nyplSource = 'sierra-nypl'

  return bib
}

function getValidationIssues (obj, type) {
  var paths = []
  type.isValid(obj, {
    errorHook: function (path, any, type) {
      paths.push({ path, any, type })
    }
  })
  return paths
}

function kinesify (record, avroType) {
  // encode avro
  var buf
  try {
    buf = avroType.toBuffer(record)
  } catch (e) {
    console.log('Validation errors:')
    getValidationIssues(record, avroType).forEach((e) => {
      console.log(`  ${e.path.join('.')}: \n    Got: ${e.value}\n    Expected: ${e.type}`)
    })
    console.log('Aborting because problems.')
    process.exit()
  }
  // encode base64
  var encoded = buf.toString('base64')
  // kinesis format
  return {
    kinesis: {
      kinesisSchemaVersion: '1.0',
      partitionKey: 's1',
      sequenceNumber: '00000000000000000000000000000000000000000000000000000001',
      data: encoded,
      approximateArrivalTimestamp: 1428537600
    },
    eventSource: 'aws:kinesis',
    eventVersion: '1.0',
    eventID: 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
    eventName: 'aws:kinesis:record',
    invokeIdentityArn: 'arn:aws:iam::EXAMPLE',
    awsRegion: 'us-east-1',
    // We depend on the ARN ending in /Bib or /Item to determine how to decode the payload
    // Everything up to that is ignored
    eventSourceARN: `the-first-part-of-the-arn-does-not-matter...this-part-does:/${schemaNameFromNyplType(record.nyplType)}`
  }
}

function schemaNameFromNyplType (type) {
  switch (type) {
    case 'bib': return 'Bib'
    case 'item': return 'Item'
    default: return null
  }
}

const fetchSchema = (url) => {
  var options = {
    url,
    json: true
  }
  return new Promise((resolve, reject) => {
    request(options, function (error, resp, body) {
      if (error) {
        console.log('Error (#request): ' + error)
        reject(error)
      }

      if (body.data && body.data.schema) {
        var schema = JSON.parse(body.data.schema)
        resolve(schema)
      }
    })
  })
}

function buildRecordsByIds (ids, nyplType) {
  // This draws from these env vars:
  // NYPL_API_BASE_URL
  // NYPL_OAUTH_KEY
  // NYPL_OAUTH_SECRET
  // NYPL_OAUTH_URL
  const dataApi = new NYPLDataApiClient()

  let nyplSource = argv.nyplSource || 'sierra-nypl'

  return Promise.all(
    ids.map((id) => {
      // If ids given like 'recap-hl/990147064120203941, sierra-nypl/10370882, ...',
      // split them properly:
      if (id.split('/').length === 2) {
        ; [nyplSource, id] = id.split('/')
      }
      return dataApi.get(`${nyplType}s/${nyplSource}/${id}`)
        .then((rec) => {
          if (!rec || rec.statusCode === 404) {
            // Fatal error if it's the only failure
            if (ids.length === 1) throw new Error(`Error fetching ${nyplType}s/${nyplSource}/${id}`)
            else console.warn(`Error fetching ${nyplType}s/${nyplSource}/${id}`)
            return null
          }
          return rec
        })
    })
  // Filter out null (404) records:
  ).then((recs) => recs.filter((rec) => rec))
}

function buildRecordsByPaths (paths) {
  // read unencoded data
  let records = paths
    .map((f) => fs.readFileSync(f, 'utf8'))
    .map(JSON.parse)

  // If we're dealing with a single unencoded event json, extract the Records from it:
  if (records.length === 1 && records[0].Records) records = records[0].Records

  return Promise.resolve(records)
}

function writeEncodedEvent (records, schema) {
  // initialize avro schema
  var avroType = avro.parse(schema)

  // encode data and put in kinesis format
  var kinesisEncodedData = records
    .map(function (record) {
      return kinesify(fixRecord(record), avroType)
    })

  // stringify and write to file
  var json = JSON.stringify({ Records: kinesisEncodedData }, null, 2)
  fs.writeFile(outfile, json, 'utf8', function (err, data) {
    if (err) {
      console.log('Write error:', err)
    } else {
      console.log(`Successfully wrote event.json with ${kinesisEncodedData.length} encoded ${records[0].nyplType} record(s)`)
    }
  })
}

// Load up AWS creds:
require('./lib/local-env-helper')

// If called with -ids="15796439, 15796440, 15796449, 15796502...", fetch [nypl] bibs by id:
if (argv.ids) {
  // If schemaUrl not explicitly given, construct it from nyplType of first record:
  const schemaName = schemaNameFromNyplType(argv.nyplType)
  if (!schemaUrl) schemaUrl = `https://platform.nypl.org/api/v0.1/current-schemas/${schemaName}`

  const ids = argv.ids.split(',').map((id) => id.trim())

  // Fetch records and schema in parallel:
  Promise.all([
    buildRecordsByIds(ids, argv.nyplType),
    fetchSchema(schemaUrl)
  ]).then((resp) => {
    const [records, schema] = resp
    // Write the encoded event.json
    return writeEncodedEvent(records, schema)
  }).catch((error) => `error building records or fetching schema: ${error}`)

// Otherwise process given infile(s)
} else if (infile) {
  // First parse given paths:
  const paths = infile.split(',')
  buildRecordsByPaths(paths)
    .then((records) => {
      // Now that we have the records, we can infer the schema (if needed)
      // If schemaUrl not explicitly given, construct it from nyplType of first record:
      const schemaName = schemaNameFromNyplType(records[0].nyplType)
      if (!schemaUrl) schemaUrl = `https://platform.nypl.org/api/v0.1/current-schemas/${schemaName}`

      return fetchSchema(schemaUrl)
        .then((schema) => {
          // Write the encoded event.json
          return writeEncodedEvent(records, schema)
        }).catch((error) => console.log('error writing encoded event,', error))
    })
}
