'use strict'

const _ = require('highland')
const serializers = require('./pcdm-serializer')
const db = require('./db')
const readJson = require('./utils').readJson
const log = require('loglevel')

class GenericEntityUpdater {
  constructor (vocab) {
    this.vocab = vocab
    this.jsonPath = `./data/${vocab}.json`
  }

  serialize (ent) {
    return serializers.PcdmEntitySerializer.serialize(ent)
  }

  update (offset, limit) {
    readJson(this.jsonPath).then((data) => {
      var stream = _(data['@graph'])
        .map(this.serialize)
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .map((l) => {
          log.debug('Serialized: ', JSON.stringify(l, null, 2))
          return l
        })
        .stopOnError((e) => {
          console.log('Error with: ', e)
          process.exit()
        })

      // Apply limit, if given
      if (offset && limit) stream = stream.slice(offset, offset + limit)
      else if (limit) stream = stream.take(limit)

      stream.batch(100)
        .throttle(500)
        .map((records) => {
          log.debug('Save records: ', JSON.stringify(records, null, 2))
          return db.upsertMany(this.vocab, records)
        })
        .flatMap((promise) => _(promise)) // resolve promises, per https://github.com/caolan/highland/issues/290
        .done(function (err) {
          if (err) console.log(err)
          console.log(`Done updating locations (${offset}, ${limit})`)
          process.exit()
        })
    })
  }
}

module.exports = GenericEntityUpdater
