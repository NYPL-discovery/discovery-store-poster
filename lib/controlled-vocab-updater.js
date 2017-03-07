'use strict'

const _ = require('highland')
const pluralize = require('pluralize')

const EntitySerializer = require('./serializers/entity')
// const db = require('./db')
const readJson = require('./utils').readJson
const log = require('loglevel')

class ControlledVocabUpdater {
  constructor (vocab) {
    this.vocab = vocab
    this.jsonPath = `./data/${vocab}.json`
  }

  serialize (ent) {
    console.log('got statements: ', EntitySerializer.fromJson(ent))
    return EntitySerializer.fromJson(ent) // serializers.PcdmEntitySerializer.serialize(ent)
  }

  update (offset, limit) {
    var type = pluralize.singular(this.vocab)

    readJson(this.jsonPath).then((data) => {
      var stream = _(data['@graph'])
        .map(this.serialize)
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290

      // Apply limit, if given
      if (offset && limit) stream = stream.slice(offset, offset + limit)
      else if (limit) stream = stream.take(limit)

      stream
        .flatten()
        .batchWithTimeOrCount(100, 100)
        .map((statements) => {
          log.debug('stmts: ', statements)
          return statements
        })
        // .map((stmts) => db.upsertStatements(type, stmts))
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .stopOnError((e) => {
          console.log('Error with: ', e)
          process.exit()
        })
        .done((err) => {
          if (err) console.log(err)
          console.log(`Done updating ${data['@graph'].length} ${this.vocab}` + (offset || limit ? ` (${offset}, ${limit})` : ''))
          process.exit()
        })
    })
  }
}

module.exports = ControlledVocabUpdater
