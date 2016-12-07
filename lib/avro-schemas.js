'use strict'

var rp = require('request-promise')
var avro = require('avsc')

const log = require('loglevel')

class AvroSchemas {
  constructor (parsedSchemas) {
    this._parsed = parsedSchemas
  }

  getAllSchemaVersions (topic) {
    if (Object.keys(this._parsed).indexOf(topic) < 0) return null

    return this._parsed[topic]
  }

  getSchemaForOffset (topic, offset) {
    var schemas = this.getAllSchemaVersions(topic)
    if (!schemas || schemas.length === 0) return null

    return schemas.filter((schema) => {
      return !offset ||
        (schema.offsetBegin <= offset && (!schema.offsetEnd || schema.offsetEnd >= offset))
    })[0]
  }

  fromBuffer (data, topic, offset) {
    var schema = null
    if ((typeof offset) === 'number') {
      schema = this.getSchemaForOffset(topic, offset)
    } else {
      schema = this.getAllSchemaVersions(topic).reduce((possibleSchema) => {
        try {
          return possibleSchema.fromBuffer(data)
        } catch (e) {
          console.log('error: ', e)
        }
      }, [])[0]
    }
    if (schema) {
      return schema.schema.fromBuffer(data)
    } else {
      var err = {
        name: 'avro error',
        message: 'Could not deserialize data as ' + topic + ' (offset ' + offset + ')'
      }
      throw err
    }
  }

  toBuffer (data, topic, offset) {
    var schema = this.getSchemaForOffset(topic, offset)
    if (schema) {
      return schema.schema.toBuffer(data)
    } else {
      return null
    }
  }
}

AvroSchemas.initialize = () => {
  log.debug('AvroScheams#initialize')

  return new Promise((resolve, reject) => {
    rp({ uri: 'https://api.nypltech.org/api/v0.1/schemas' }).then((s) => {
      var parsed = {}

      try {
        JSON.parse(s).data.forEach((s) => {
          if (!parsed[s.topic]) parsed[s.topic] = []

          // Pull offsets out
          // and parse the `schema` property, which is escaped json
          var schema = {
            offsetBegin: s.offsetBegin,
            offsetEnd: s.offsetEnd,
            schema: avro.parse(JSON.parse(s.schema))
          }
          parsed[s.topic].push(schema)
        })

        log.debug('AvroScheams#parsed avro schemas')
        resolve(new AvroSchemas(parsed))
      } catch (err) {
        console.log('AvroSchemas#initialize: Error parsing ', err, s)
        reject(err)
      }
    })
    .catch((err) => reject(err))
  })
}

module.exports = AvroSchemas
