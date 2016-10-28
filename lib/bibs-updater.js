'use strict'

const _ = require('highland')

const AvroSchemas = require('./avro-schemas')
const PcdmBibSerializer = require('./pcdm-serializer').PcdmBibSerializer
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer

const db = require('./db')
const SierraRecord = require('./models').SierraRecord

const shadowcatRemediate = require('./shadowcat-remediator').remediate

const nyplApi = require('./nyplDataApi')

const log = require('loglevel')

var KafkaConsumer = require('./kafka-client').KafkaConsumer

class BibsUpdater {
  processBib (buffered) {
    var bib = null

    try {
      log.debug('BibsUpdater#processBib', buffered.value)
      bib = AvroSchemas.fromBuffer(buffered.value, 'Bib')
    } catch (e) {
      // log.error('__________ERROR__ Error decoding value: ', e)
      //
      log.error('Errors against Bib schema:')
      AvroSchemas.checkValid(buffered.value, 'Bib', (path, any, type) => {
        log.warn(`Invalid field: ${path.join('.')}=${any} ; Should be ${type}`)
      })
    }

    /*
    if (!bib) {
      try {
        bib = AvroSchemas.fromBuffer(buffered.value, 'Bib_previous')
        console.log('got bib? ', bib)
      } catch (e) {
        log.error('Errors against Bib_previous schema:')
        AvroSchemas.checkValid(buffered.value, 'Bib_previous', (path, any, type) => {
          log.warn(`Invalid field: ${path.join('.')}=${any} ; Should be ${type}`)
        })
      }
    } */

    log.info('BibsUpdater#processBib deserialized', buffered.offset, ':', bib.id)
    log.debug('BibsUpdater#processBib deserialized:', bib)
    return bib
  }

  skip (bib) {
    log.warn('Skipping bib', bib.id)
  }

  update (offset, limit, options) {
    log.info('BibsUpdater#update: reading from kafka offset', offset || 0, ', limit', limit || '[unbounded]')
    AvroSchemas.initialize().then((avro) => {
      var totalProcessed = 0

      var stream = (new KafkaConsumer()).consume('Bib', { offset })

      // Apply limit, if given
      if (limit) stream = stream.take(limit)

      stream = stream.map((b) => this.processBib(b))
        .map((b) => SierraRecord.from(b))
        .filter((b) => this.validForSerialization(b))
        .map((b) => PcdmBibSerializer.serialize(b))
        .flatMap((promise) => _(promise))     // resolve promises, per https://github.com/caolan/highland/issues/290
        .compact()                            // drop null (invalid) bibs
        .map((res) => {
          log.debug('Serialized: ', JSON.stringify(res, null, 2))
          return res
        })
        .map(shadowcatRemediate)              // Add shadowcat fields
        .flatMap((promise) => _(promise))     // resolve promises
        .stopOnError((e) => {
          log.error('BibsUpdater#update: Error with: ', e)
          process.exit()
        })

      if (options.debug) {
        stream.each((obj) => {
          console.log('________________________________________________________\nSaving', JSON.stringify(obj, null, 2))
        })
        .done()
      } else {
        // stream
          // .map((record) => db.resources.updateBibData(record))
        stream.batchWithTimeOrCount(100, 100)
          .map((records) => db.resources.upsertMany(records)) // Save records in bulk
          .flatMap((promise) => _(promise))             // Resolve mongo insert promises
          .map((batch) => {
            log.info(`Saved batch of ${batch.length}`)
            totalProcessed += batch.length
            return batch
          })
          .stopOnError((e) => {                         // Check for mongo errors
            log.error('Error saving:', e)
            process.exit()
          })
          .done(function (err) {
            if (err) log.error(err)
            log.info(`Done updating ${totalProcessed} resources (${offset || 0}, ${limit || '[unbounded]'})`)
            process.exit()
          })
      }
    })
  }

  backfill () {
    db.connect().then((db) => {
      _(db.collection('resources').find({}).stream())
        .reduce([], (a, resource) => {
          if (resource['dcterms:identifier']) {
            resource['dcterms:identifier'].filter((identifier) => identifier.objectUri.match(/urn:bnum:/)).forEach((identifier) => a.push(identifier.objectUri.replace(/^urn:bnum:/, '')))
          }
          return a
        })
        .series()
        .uniq()
        .map(this.bib)
        .flatMap((promise) => _(promise))
        .stopOnError((e) => {                         // Check for mongo errors
          log.error('Error saving:', e)
          process.exit()
        })
        .done(function (err) {
          if (err) log.error(err)
          log.info('Done updating')
          process.exit()
        })
    }).catch((e) => log.error(e))
  }

  bibs () {
    log.info('BibsUpdater#bibs: Fetch all')
    return nyplApi.bibs().then((bibs) => {
      log.info('Consuming bibs: ', bibs.length)
      return Promise.all(bibs.map(this._saveBib))
    })
  }

  bib (id) {
    log.info('BibsUpdater#bib: Fetch bib by id: ', id)
    return nyplApi.bib(id).then((bib) => {
      if (!bib) return Promise.reject('Can not find ', id)

      return this._saveBib(bib)
    }).catch((e) => log.error(`BibsUpdater#bib: Error updating bib ${id}:`, e))
  }

  _saveBib (bib) {
    log.info('BibsUpdater#_saveBib: ________________________________________________________')

    return PcdmBibSerializer.serialize(bib).then(shadowcatRemediate).then((serialized) => {
      log.debug('BibsUpdater#_saveBib: Serialized: ', JSON.stringify(serialized, null, 2))

      return db.resources.upsertMany([serialized]).then(() => {
        log.info(`BibsUpdater#_saveBib: Done updating ${bib.id}`)
      })
    }).then(() => {
      return nyplApi.itemsForBib(bib.id).then((items) => {
        if (!items) return Promise.resolve(bib)

        log.info(`BibsUpdater#_saveBib: Got ${items.length} items for bib`) // , JSON.stringify(items, null, 2))
        return Promise.all(items.map(PcdmItemSerializer.serialize)).then((serialized) => {
          return db.resources.upsertMany(serialized).then(() => {
            log.info('BibsUpdater#_saveBib: Done saving items')
          })
        })
      })
    }).catch((e) => log.error(`BibsUpdater#_saveBib: Error updating bib ${bib.id}:`, e))
  }

  validForSerialization (bib) {
    var valid = true

    valid = valid && bib.id

    // there are some specific notes buried in the MARC that means it should not go into the registry
    valid = valid && !JSON.stringify(bib).match(/Rare Book Division Accession File.*?Converted/gi)

    if (!valid) console.warn('Bib', bib.id, 'invalid for serialization')

    return valid
  }
}

module.exports = BibsUpdater
