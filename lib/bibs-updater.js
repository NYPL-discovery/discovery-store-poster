'use strict'

const _ = require('highland')

var log = require('loglevel')
const config = require('config')
const cluster = require('cluster')

const AvroSchemas = require('./avro-schemas')
const PcdmBibSerializer = require('./pcdm-serializer').PcdmBibSerializer
const PcdmItemSerializer = require('./pcdm-serializer').PcdmItemSerializer
const db = require('./db')
const utils = require('./utils')
const SierraRecord = require('./models').SierraRecord
const shadowcatRemediate = require('./shadowcat-remediator').remediate
const nyplApi = require('./nyplDataApi')
const IndexerRunner = require('./indexer-runner')

const CACHE_TO_DISK = false

var KafkaConsumer = require('./kafka-client').KafkaConsumer

class BibsUpdater {
  deserialize (buffered, avro) {
    var bib = null

    try {
      // log.debug('BibsUpdater#deserialize', JSON.stringify(buffered, null, 2))
      bib = avro.fromBuffer(buffered.value, 'Bib', buffered.offset)
      if (bib) log.info(`BibsUpdater#deserialized ${buffered.offset}: ${bib.nyplSource}: ${bib.id}`)
    } catch (e) {
      log.error('__________ERROR__ Error decoding value: ', e)
    }

    return bib
  }

  extractElectronicItem (bib) {
    return PcdmBibSerializer.parseElectronicResources(bib).then((resources) => {
      if (!resources) return Promise.resolve(bib)

      // If none of the electronic resources are deemed ER (i.e. they're appendices/TOC, etc), don't create item
      resources = resources.filter((r) => r.type === 'ER')
      if (resources.length === 0) return Promise.resolve(bib)

      var item = {
        id: `${bib.id}-e`,
        bibIds: [bib.id],
        electronicResources: resources
      }

      return PcdmItemSerializer.serialize(SierraRecord.from(item)).then((serialized) => {
        // console.log('Extracted electronic resource, serialized:', serialized)
        return serialized
      }).then(db.resources.upsertOne).then(() => bib)
    })
  }

  saveToDisc (bib) {
    var path = `./cache/bibs/${bib.nyplSource}/${bib.id}.json`
    if (CACHE_TO_DISK) return utils.writeFile(path, JSON.stringify(bib, null, 2)).then(() => bib)
    else return Promise.resolve(bib)
  }

  skip (bib) {
    log.warn('Skipping bib', bib.id)
  }

  update (offset, limit, options) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    log.info(`BibsUpdater#update: reading from ${config.get('kafka.bibs.topic')}, offset`, offset || 0, ', limit', limit || '[unbounded]')
    AvroSchemas.initialize().then((avro) => {
      var totalProcessed = 0

      var stream = (new KafkaConsumer()).consume(config.get('kafka.bibs.topic'), { offset })

      // Apply limit, if given
      if (limit) stream = stream.take(limit)

      var consumed = 0
      stream = stream
        .map((b) => {
          consumed += 1
          // console.log('consumed: ', consumed)
          return b
        })
        .map((b) => this.deserialize(b, avro))
        /* .stopOnError((e) => {
          log.error('BibsUpdater error deserializing', e)
          process.exit()
        }) */
        .compact()                            // drop null (invalid) bibs
        .map((r) => _(this.saveToDisc(r)))
        .parallel(10)
        .map((b) => SierraRecord.from(b))
        .map((b) => _(this.extractElectronicItem(b)))  // Extract elect item if any
        .parallel(10)
        .map((b) => {
          log.debug('Bib: ', JSON.stringify(b, null, 2))
          return b
        })
        .filter(this.validForSerialization)
        .map((b) => _(PcdmBibSerializer.serialize(b)))
        .parallel(10)
        /* .stopOnError((e) => {
          log.error('BibsUpdater#serialized: Error: ', e)
          process.exit()
        }) */
        .compact()                            // drop null (invalid) bibs
        .map((res) => {
          log.debug('Serialized: ', JSON.stringify(res, null, 2))
          return res
        })
        .map((r) => _(shadowcatRemediate(r)))              // Add shadowcat fields
        // .flatMap((promise) => _(promise))     // resolve promises
        .parallel(10)
        .stopOnError((e) => {
          log.error('BibsUpdater#remediated: Error: ', e)
          console.trace(e)
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
          .map((b) => {
            // console.log('got b: ', b)
            return b
          })
          // .map((r) => _(db.resources.upsertMany(r))) // Save records in bulk
          .map((r) => {
            console.log('save: ', r)
          })
          .stopOnError((e) => {
            log.error('BibsUpdater#upsert: Error: ', e)
            console.trace(e)
            process.exit()
          })
          .parallel(1)
          .map((batch) => {
            log.info(`BibsUpdater#update: Saved batch of ${batch.length}`)
            if (options.onUpdate) options.onUpdate(batch.length)
            totalProcessed += batch.length
            return batch
          })
          /* .stopOnError((e) => {                         // Check for mongo errors
            log.error('Error saving:', e)
            process.exit()
          })
          */
          .done(function (err) {
            if (err) log.error(err)
            log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (${offset || 0}, ${limit || '[unbounded]'})`)
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
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    // nyplSource = 'nypl-test'
    console.log('prefix: ', prefix)
    if (prefix === 'pb') nyplSource = 'recap-PUL'
    if (prefix === 'cb') nyplSource = 'recap-COL'

    if (true) {
      console.log('path', `./cache/bibs/${nyplSource}/${id}.json`)
      return utils.readJson(`./cache/bibs/${nyplSource}/${id}.json`).then((bib) => {
        bib = SierraRecord.from(bib)
        return this._saveBib(bib, nyplSource)
      })
    } else {
      log.info('BibsUpdater#bib: Fetch bib by id: ', id)
      return nyplApi.bib(nyplSource, id).then((bib) => {
        if (!bib) return Promise.reject('Can not find ', id)

        return this._saveBib(bib, nyplSource)
      }).catch((e) => log.error(`BibsUpdater#bib: Error updating bib ${id}:`, e))
    }
  }

  _saveBib (bib, nyplSource) {
    console.log('serializing')
    return this.extractElectronicItem(bib).then(PcdmBibSerializer.serialize).then(shadowcatRemediate).then((serialized) => {
      var statements = utils.flattenArray(
        Object.keys(serialized).map((predicate) => {
          if ((typeof serialized[predicate]) !== 'object') return

          return serialized[predicate].map((stmt) => {
            return {
              subject_id: serialized.uri,
              predicate,
              object_id: stmt.objectUri || null,
              object_literal: stmt.objectLiteral || null,
              object_label: stmt.objectLabel || null,
              source: stmt.provo[0].source || null,
              source_record_id: stmt.provo[0].recordIdentifier || null,
              source_record_path: null,
              creator: stmt.provo[0].creator || 'main-serializer'
            }
          })
        })
      ).filter((statement) => statement)// .slice(1, 2)
      console.log('statements: ', statements)

      return Promise.all(statements.map((stmt) => db.upsertStatement('resource_statement', stmt)))
    })
    /*

    log.info('BibsUpdater#_saveBib: ________________________________________________________')

    return this.extractElectronicItem(bib).then(PcdmBibSerializer.serialize).then(shadowcatRemediate).then((serialized) => {
      log.debug('BibsUpdater#_saveBib: Serialized: ', JSON.stringify(serialized, null, 2))

      return db.resources.upsertMany([serialized]).then(() => {
        log.info(`BibsUpdater#_saveBib: Done updating ${bib.id}`)
      })
    }).then(() => {
      return nyplApi.itemsForBib(nyplSource, bib.id).then((items) => {
        if (!items) return Promise.resolve(bib)

        log.info(`BibsUpdater#_saveBib: Got ${items.length} items for bib`) // , JSON.stringify(items, null, 2))
        return Promise.all(items.map(PcdmItemSerializer.serialize)).then((serialized) => {
          return db.resources.upsertMany(serialized).then(() => {
            log.info('BibsUpdater#_saveBib: Done saving items')
          })
        })
      })
    }).catch((e) => log.error(`BibsUpdater#_saveBib: Error updating bib ${bib.id}:`, e))
    */
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

BibsUpdater.threaded = (opts) => {
  if (cluster.isMaster) {
    opts = Object.assign({
      disablescreen: false,
      threads: 15,
      offset: 0,
      limit: null
    }, opts)
    console.log('htreads: ', opts.threads)

    var run = (start, end) => {
      // start = 1639354
      var runner = new IndexerRunner('resources', cluster, {
        botCount: opts.threads,
        useScreen: !opts.disablescreen,
        start,
        end
      })
      runner.run()
    }

    // If explicit limit given, only process given amount
    // otherwise use current max offset
    if (opts.limit) run(opts.limit)
    else (new KafkaConsumer()).offsets(config.get('kafka.bibs.topic')).then((offsets) => run(offsets.min, offsets.max))
  } else {
    // ask for where to start
    process.send({ start: true })

    process.on('message', (msg) => {
      if (typeof msg.start !== 'number') return

      var events = {
        onUpdate: (count) => {
          process.send({ totalUpdate: count })
        },
        onLog: (str) => {
          return null
        }
      }
      ; (new BibsUpdater()).update(msg.start, msg.total, Object.assign({}, events, opts))
    })
  }
}

module.exports = BibsUpdater
