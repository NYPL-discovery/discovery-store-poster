'use strict'

const H = require('highland')

const UpdaterBase = require('./updater-base')

var log = require('loglevel')
const cluster = require('cluster')

const db = require('./db')
const utils = require('./utils')
const BibSierraRecord = require('./models/bib-sierra-record')
const ItemSierraRecord = require('./models/item-sierra-record')
const nyplApi = require('./nyplDataApi')
const IndexerRunner = require('./indexer-runner')
const bibSerializer = require('./serializers/bib')
const itemSerializer = require('./serializers/item')
const SourceLoader = require('./sources/loader')
const kmsHelper = require('./kms-helper')

class BibsUpdater extends UpdaterBase {
  deserialize (buffered, avro) {
    var bib = null
    var offset = null

    try {
      // log.debug('BibsUpdater#deserialize', JSON.stringify(buffered, null, 2))
      offset = buffered.offset
      bib = avro.fromBuffer(buffered.value, 'Bib', buffered.offset)
      if (bib) log.info(`BibsUpdater#deserialized ${buffered.offset}: ${bib.nyplSource}: ${bib.id}`)
    } catch (e) {
      log.error('__________ERROR__ Error decoding value: ', e)
    }

    return { offset, bib }
  }

  extractElectronicItem (bib) {
    let eResources = bibSerializer.extractElectronicResourcesFromBibMarc(bib, 'ER')
    if (!eResources || eResources.length === 0) return Promise.resolve(null)

    var item = {
      id: `${bib.id}-e`,
      nyplSource: bib.nyplSource,
      bibIds: [bib.id],
      electronicResources: eResources
    }
    return Promise.resolve(ItemSierraRecord.from(item))
  }

  saveToDisc (bib) {
    var path = `./cache/bibs/${bib.nyplSource}/${bib.id}.json`
    try {
      return utils.writeFile(path, JSON.stringify(bib, null, 2)).then(() => ({ path, bib }))
    } catch (e) {
      console.log('Error writing to bib disk ' + bib.id + ': ', bib)
    }
    // if (CACHE_TO_DISK) return utils.writeFile(path, JSON.stringify(bib, null, 2)).then(() => bib)
    // else return Promise.resolve(bib)
  }

  skip (bib) {
    log.warn('Skipping bib', bib.id)
  }

  handleError (e, message) {
    log.error(`BibsUpdater# Error ("${message}"): `, e)
    console.trace(e)
    return e
  }

  extractStatements (bib) {
    log.debug('Extracting statements from ' + bib.id, bib)
    return Promise.all(
      [
        this.extractElectronicItem(bib).then((item) => item ? itemSerializer.fromElectronicItem(item) : []),
        bibSerializer.fromMarcJson(bib)
      ])
      .then(utils.flattenArray)
      .then((stmts) => stmts.filter((stmt) => stmt))
      .catch((e) => {
        log.error(`Error extracting stmts for bib ${bib.nyplSource}: ${bib.id}:`, e)
        log.trace(e)
        // return this.saveToDisc(bib).then((r) => {
        //   console.log('Saved problematic bib to disk: ', r.path)
        //   console.log(`  Run with --uri b${bib.id} to test again`)
        // })
      })
  }

  // Takes an array of bibs that need to be updated in the store
  // Returns a Promise that resolves when successful
  update (options, bibs) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        trace: () => {},
        debug: () => {}
      }
    }

    log.info(`BibsUpdater#update: Processing ${bibs.length} bibs: ${bibs.map((bib) => bib.id).join(', ')}`)
    var stream = H(bibs)
      .map((bib) => BibSierraRecord.from(bib))

    return this._processBibStream(stream, options)
  }

  // Takes a highland stream of bibs to process. Does these things:
  //   1. extracts statements
  //   2. writes statements to store
  //   3. writes statement ids to kinesis stream
  // Returns a Promise that resolves when all three are successful
  //
  // The `options` hash should include following for reporting purposes:
  //  offset: index offset we're operating on in greater stream
  //  limit: numeric limit we're operating on in greater stream
  _processBibStream (stream, options) {
    if (!options) options = {}
    var totalProcessed = 0

    return new Promise((resolve, reject) => {
      stream
        .map((b) => {
          log.debug('Processing bib: ', JSON.stringify(b, null, 2))
          return b
        })
        .map((bib) => this.extractStatements(bib).then((statements) => ({ statements, bib })))
        .flatMap((r) => H(r))
        .map((stmts) => {
          log.debug(`Got ${stmts.statements ? stmts.statements.length : 'null'} statements for ${stmts.bib.id}`)
          return stmts
        })
        .reduce([], (memo, batch) => memo.concat(batch.statements)) // Flatten array
        .map((statements) => db.upsertStatements('resource', statements).then(() => statements).catch((e) => {
          throw new Error('Error updating database; assume connection error')
        }))
        .flatMap((r) => H(r))
        .map((statements) => db.deleteStaleStatements('resource', statements, 'bib').then(() => statements)) // Delete extra (previously serialized) statements
        .flatMap((r) => H(r))
        .map((statements) => {
          log.debug('Statements: ', statements)
          // Report on success
          // Get distinct subject_ids:
          const num = utils.distinctSubjectIds(statements).length

          if (options.onUpdate) options.onUpdate(num)
          totalProcessed += num
          log.info(`BibsUpdater#update: Saved batch of ${num} (${statements.length} statements): (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)
          return statements
        })
        .map((batch) => this._writeToIndexDocumentQueue(batch)) // Write to IndexDocumentQueue stream
        .flatMap((r) => H(r))
        .stopOnError((e) => reject(this.handleError(e, '...')))
        .done(function (err) {
          if (err) log.error(err)
          log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (from ${options.offset || 0}, limit ${options.limit || '[unbounded]'})`)
          if (options.onDone) options.onDone()

          db.disconnect()

          resolve(totalProcessed)
        })
    })
  }

  // Takes a batch of inserted records, writes to IndexDocument stream
  _writeToIndexDocumentQueue (batch) {
    let streamName = process.env.INDEX_DOCUMENT_STREAM_NAME
    let schemaName = process.env.INDEX_DOCUMENT_SCHEMA_NAME

    // Make sure stream-writing is configured
    if (streamName && schemaName) {
      // Get distinct bib ids: (should only be one..)
      const distinctBibIds = utils.distinctSubjectIds(batch)
      // Submit bib ids to write stream:
      var recs = distinctBibIds.map((uri) => {
        return { type: 'record', uri }
      })
      return this._writeToStreamsClient(streamName, recs, schemaName)
        .then(() => log.debug(`Wrote ${recs.length} to ${streamName} (encoded against ${schemaName})`))
    } else return Promise.resolve(batch)
  }

  uriFromApi (id) {
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    if (prefix === 'pb') nyplSource = 'recap-pul'
    if (prefix === 'cb') nyplSource = 'recap-cul'

    return this.bibByApi(nyplSource, id)
      .catch((e) => {
        log.info('BibsUpdater#uriFromApi: Failed to find in api: ' + id)
        // Fallback on cache:
        return utils.readJson(`../cache/bibs/${nyplSource}/${id}.json`)
          .then((bib) => {
            log.info('BibsUpdater#uriFromApi: Actually, found it cached: ' + bib.id)
            return bib
          })
          .catch((e) => log.error('Could not find bib by cache'))
      })
      .then((bib) => {
        if (!bib) return Promise.reject()

        log.debug('Bib: ', JSON.stringify(bib, null, 2))
        return bib
      })
      .then(BibSierraRecord.from)
      .then((bib) => {
        log.info('BibsUpdater#uriFromApi: Processing single-bib stream: [' + bib.id + ']')
        return this._processBibStream(
          H([bib])
        )
      })
      .catch((e) => log.error('Error: ', e))
  }

  bibByApi (nyplSource, id) {
    log.info('BibsUpdater#bibByApi: Fetch bib by id: ', nyplSource, id)
    return nyplApi.bib(nyplSource, id)
      .then((bib) => {
        if (bib) return bib
        else return Promise.reject()
      })
      .catch((e) => {
        log.error(`BibsUpdater#bibByApi: Error fetching bib from api ${id}:`, e)
        return Promise.reject()
      })
  }

  _docSerializationToStatements (serialized) {
    // console.log('seralization to statements: ', JSON.stringify(serialized, null, 2))
    return utils.flattenArray(
      Object.keys(serialized).map((predicate) => {
        // if (predicate === 'rdf:type') serialized[predicate] = [{ provo: { source: 'data:1002',  objectUri: serialized[predicate] }]
        if (serialized[predicate] === null || (typeof serialized[predicate]) !== 'object') return

        // console.log('map..', predicate, (typeof serialized[predicate]), JSON.stringify(serialized[predicate]))
        return serialized[predicate].map((stmt, ind) => {
          return {
            subject_id: serialized.uri,
            predicate,
            // rule_uri: stmt.rule_uri || `main-updater-${predicate}-${ind}`,
            object_id: stmt.objectUri || null,
            object_literal: stmt.objectLiteral || null,
            object_label: stmt.objectLabel || null,
            source: stmt.provo && stmt.provo.length > 0 ? stmt.provo[0].source : null || null,
            source_record_id: stmt.provo && stmt.provo.length > 0 ? stmt.provo[0].recordIdentifier : null || null,
            source_record_path: stmt.source_record_path || `//${predicate}[${ind}]`,
            creator: stmt.provo && stmt.provo.length > 0 ? stmt.provo[0].creator : null || 'main-serializer'
          }
        })
      })
    ).filter((statement) => statement)// .slice(1, 2)
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

    var run = (start, end) => {
      var runner = new IndexerRunner('resources', cluster, {
        botCount: opts.threads,
        start,
        end
      })
      runner.run()
    }

    var bibsSource = SourceLoader.load(opts.bibsSource)

    // If explicit limit given, only process given amount
    // otherwise use current max offset
    if (opts.limit) {
      var offset = opts.offset || 0
      run(offset, offset + opts.limit)
    } else {
      bibsSource.count().then((count) => {
        run(opts.offset || 0, count)
      })
    }
  } else {
    // ask for where to start
    process.send({ start: true })

    process.on('message', (msg) => {
      if (typeof msg.start !== 'number') return

      var events = {
        onUpdate: (count) => {
          process.send({ totalUpdate: count })
        },
        onDone: () => process.exit(),
        onLog: (str) => {
          return null
        }
      }
      if (opts.disablescreen) {
        delete events.onLog
      }
      opts.offset = msg.start
      opts.limit = msg.total

      kmsHelper.decryptDbCreds().then((dbConnectionString) => {
        db.setConn(dbConnectionString)
      }).then(() => {
        var bibs = bibsSource.stream().slice(msg.start, msg.start + msg.total)
        ; (new BibsUpdater()).update(Object.assign({}, events, opts), bibs)
      })
    })
  }
}

module.exports = BibsUpdater
