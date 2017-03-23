// Usage:
//  The following command will take unencoded json, encode it with avro schema, encode it with base64, and put in Kinesis format.
//    node kinesify-data.js event.unencoded.bibs.json event.json https://api.nypltech.org/api/v0.1/current-schemas/Bib
//
//  If infile is a plain marcinjson document, it will be converted into the right form.
//  i.e. You can load sample docs directly from the test data:
//    node kinesify-data test/data/bib-10011745.json event.json  https://api.nypltech.org/api/v0.1/current-schemas/Bib

const args = process.argv.slice(2)
const avro = require('avsc')
const fs = require('fs')
const request = require('request')
const config = require('config')

// config
const infile = args[0]
const outfile = args[1]
const schemaUrl = args[2]

function onSchemaLoad (schema) {
  // initialize avro schema
  var avroType = avro.parse(schema)

  // read unencoded data
  var unencodedData = JSON.parse(fs.readFileSync(infile, 'utf8'))

  // If it's a plain marcinjson document, convert it into the event.json form:
  if (!unencodedData.Records && unencodedData.id) unencodedData = { Records: [unencodedData] }

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
      console.log('Successfully wrote data to file')
    }
  })
}

// Correct common record issues (e.g. missing fields)
function fixRecord (record) {
  if (record.nyplType === 'bib') return fixBib(record)
  return record
}

function fixBib (bib) {
  bib.varFields = (bib.varFields || []).map((field) => {
    // Seems that var subFields sometimes appear under `subfields` in violation of schema, so correct it:
    if (field.subfields) {
      field.subFields = field.subfields
      delete field.subfields
    }
    return field
  }, {})

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
      console.log(`  ${e.path.join('.')}: \n    Got ${e.value}\n    Expected ${e.type}`)
    })
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

var options = {
  uri: schemaUrl,
  json: true
}

request(options, function (error, resp, body) {
  if (error) console.log('Error (#request): ' + error)

  if (body.data && body.data.schema) {
    console.log('Loaded schema')
    var schema = JSON.parse(body.data.schema)
    onSchemaLoad(schema)
  }
})
