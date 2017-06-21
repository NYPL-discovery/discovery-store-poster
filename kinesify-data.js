// Usage:
//    node kinesify-data.js INFILES OUTFILE [SCHEMAURL]
//
//  The following command will take unencoded json, encode it with avro schema, encode it with base64, and put in Kinesis format.
//    node kinesify-data.js event.unencoded.bibs.json event.json https://api.nypltech.org/api/v0.1/current-schemas/Bib
//
//  If infile is a plain marcinjson document, it will be converted into the right form.
//  i.e. You can load sample docs directly from the test data:
//    node kinesify-data test/data/bib-10011745.json event.json  https://api.nypltech.org/api/v0.1/current-schemas/Bib
//
//  If you want to load up multiple bibs or items in one event.json (to test batches > 1),
//  infile accepts comma-delimited paths:
//    node kinesify-data test/data/bib-11079574.json,test/data/bib-11253008.json,test/data/bib-10011745.json event.json https://api.nypltech.org/api/v0.1/current-schemas/Bib

const args = process.argv.slice(2)
const avro = require('avsc')
const fs = require('fs')
const request = require('request')
const config = require('config')

// config
const infile = args[0]
const outfile = args[1] || 'event.json'
var schemaUrl = args[2] || 'https://api.nypltech.org/api/v0.1/current-schemas/Bib'

function onSchemaLoad (schema) {
  // initialize avro schema
  var avroType = avro.parse(schema)

  // encode data and put in kinesis format
  var kinesisEncodedData = unencodedData.Records
    .map(function (record) {
      return kinesify(fixRecord(record), avroType)
    })

  // stringify and write to file
  var json = JSON.stringify({ 'Records': kinesisEncodedData }, null, 2)
  fs.writeFile(outfile, json, 'utf8', function (err, data) {
    if (err) {
      console.log('Write error:', err)
    } else {
      console.log(`Successfully wrote event.json with ${kinesisEncodedData.length} encoded record(s)`)
    }
  })
}

// Correct common record issues (e.g. missing fields)
function fixRecord (record) {
  if (record.nyplType === 'bib') return fixBib(record)
  if (record.nyplType === 'item') return fixItem(record)
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
    // Seems that var subFields sometimes appear under `subfields` in violation of schema, so correct it:
    if (field.subfields) {
      field.subFields = field.subfields
      delete field.subfields
    }
    // Assign following fields to null if not otherwise set:
    field = ['subFields', 'content', 'display', 'ind1', 'ind2', 'marcTag'].reduce((f, prop) => f[prop] ? f : Object.assign(f, { [prop]: null }), field)

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

  bib = ['deletedDate'].reduce((f, prop) => f[prop] ? f : Object.assign(f, { [prop]: null }), bib)
  // if (!bib.deletedDate) bib.deletedDate = null

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
    'kinesis': {
      'kinesisSchemaVersion': '1.0',
      'partitionKey': 's1',
      'sequenceNumber': '00000000000000000000000000000000000000000000000000000001',
      'data': encoded,
      'approximateArrivalTimestamp': 1428537600
    },
    'eventSource': 'aws:kinesis',
    'eventVersion': '1.0',
    'eventID': 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
    'eventName': 'aws:kinesis:record',
    'invokeIdentityArn': 'arn:aws:iam::EXAMPLE',
    'awsRegion': 'us-east-1',
    'eventSourceARN': config.get('kinesisReadStreams')[record.nyplType]
  }
}

// read unencoded data
var unencodedData = infile.split(',')
  .map((f) => fs.readFileSync(f, 'utf8'))
  .map(JSON.parse)

// If they're plain marcinjson document(s), convert them into the event.json form:
if (!unencodedData[0].Records && unencodedData[0].id) unencodedData = { Records: unencodedData }

// Otherwise, if it's a single event-formatted json:
else if (unencodedData[0].Records && unencodedData.length === 1) unencodedData = unencodedData.shift()

// As a convenience, if schemaUrl not explicitly given, derive it from nyplType of first record:
if (!schemaUrl) {
  var type = unencodedData.Records[0].nyplType
  console.log('Inferring schema type: ', type)
  schemaUrl = `https://api.nypltech.org/api/v0.1/current-schemas/${type.substring(0, 1).toUpperCase()}${type.substring(1)}`
}

var options = {
  uri: schemaUrl,
  json: true
}
request(options, function (error, resp, body) {
  if (error) console.log('Error (#request): ' + error)

  if (body.data && body.data.schema) {
    // console.log('Loaded schema', body.data.schema)
    var schema = JSON.parse(body.data.schema)
    onSchemaLoad(schema)
  }
})
