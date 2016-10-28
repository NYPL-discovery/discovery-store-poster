'use strict'

var rp = require('request-promise')
var avro = require('avsc')

const log = require('loglevel')

class AvroSchemas {
}

AvroSchemas.toBuffer = (data, name) => {
  return AvroSchemas._parsed[name].toBuffer(data)
}

AvroSchemas.fromBuffer = (data, name) => {
  // console.log('encoded: ', data, AvroSchemas._parsed[name].fromBuffer(data))
  return AvroSchemas._parsed[name].fromBuffer(data)
}

AvroSchemas.inspect = (data) => {
  // console.log('encoded: ', data, AvroSchemas._parsed[name].fromBuffer(data))
  return AvroSchemas._parsed['open-schema'].fromBuffer(data)
}

AvroSchemas.checkValid = (data, name, cb) => {
  return AvroSchemas._parsed[name].isValid(data, {errorHook: cb})
}

AvroSchemas.initialize = () => {
  log.debug('AvroScheams#initialize')
  return new Promise((resolve, reject) => {
    rp({ uri: 'https://api.nypltech.org/api/v0.1/schemas' }).then((s) => {
      AvroSchemas._parsed = {}
      try {
        JSON.parse(s).data.map((s) => s.schema).forEach((s) => {
          if (false && s.name === 'Bib') {
            // console.log('from: ', s)
            var modded = Object.assign({}, s)

            modded.fields = modded.fields.filter((f) => ['nyplSource', 'nyplType'].indexOf(f.name) < 0)
            // AvroSchemas._parsed[`${s.name}_previous`] = avro.parse(modded)
            AvroSchemas._parsed[s.name] = avro.parse(modded)
            console.log('Built fallback Bib schema:', modded)
          } else {
            AvroSchemas._parsed[s.name] = avro.parse(s)
          }
        })

        log.debug('AvroScheams#parsed avro schemas')
        resolve(AvroSchemas._parsed)
      } catch (err) {
        console.log('Error parsing ', s)
        reject(err)
      }
    })
    .catch((err) => reject(err))
  })
}

module.exports = AvroSchemas
