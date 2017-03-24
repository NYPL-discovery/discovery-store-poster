'use strict'

const H = require('highland')

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
// TODO: Implement shadowcat remediations in a post-shadowcat world.
// const shadowcatRemediate = require('./shadowcat-remediator')
const SourceLoader = require('./sources/loader')
const Shadowcat = require('./shadowcat')
const config = require('config')
const KinesisWriter = require('./KinesisWriter')

// var bibsSource = new NdJsonSource('./test/data/b1.ndjson')

if (!config.has('bibsSource')) {
  log.error('No bibsSource configured.')
  process.exit()
}
var bibsSource = SourceLoader.load(config.get('bibsSource'))

class BibsUpdater {
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
    return bibSerializer.extractElectronicResourcesFromBibMarc(bib).then((resources) => {
      if (!resources) return Promise.resolve(null)

      // If none of the electronic resources are deemed ER (i.e. they're appendices/TOC, etc), don't create item
      resources = resources.filter((r) => r.type === 'ER')
      if (resources.length === 0) return Promise.resolve(null)

      var item = {
        id: `${bib.id}-e`,
        nyplSource: bib.nyplSource,
        bibIds: [bib.id],
        electronicResources: resources
      }
      return ItemSierraRecord.from(item)
    })
  }

  saveToDisc (bib) {
    var path = `./cache/bibs/${bib.nyplSource}/${bib.id}.json`
    return utils.writeFile(path, JSON.stringify(bib, null, 2)).then(() => ({ path, bib }))
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
    return Promise.all(
      [
        this.extractElectronicItem(bib).then((item) => item ? itemSerializer.fromElectronicItem(item) : []),
        bibSerializer.fromMarcJson(bib)
      ])
      .then(utils.flattenArray)
      .then((stmts) => stmts.filter((stmt) => stmt))
      .catch((e) => {
        log.error('Error extracting stmts: ', e)
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
        debug: () => {}
      }
    }
    var stream = H(bibs.map((bib) => BibSierraRecord.from(bib)))

    // return this._processBibKinesis(nonstreamBib, options)
    return this._processBibStream(stream, options)
  }

  /* _processBibKinesis (bib, options) {
    return this.extractStatements(bib)
      .then((statements) => ({ statements, bib }))
      .then((stmts) => {
        return db
          .upsertStatements('resource', stmts.statements)
          .then(() => ({ count: stmts.statements.length, bib: stmts.bib }))
          .then(() => stmts)
      })
      .then((object) => {
        // sending to s3/kinesis
        return (new KinesisWriter()).write(object)
      })
      .then((object) => {
        console.log('done writing all statements to db')
        return object
      })
  } */

  // Takes a highland stream of bibs to process. Does these things:
  //   1. extracts statements
  //   2. writes statements to store
  //   3. writes statement ids to kinesis stream
  // Returns a Promise that resolves when all three are successful
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
          log.debug(`Got  ${stmts.statements.length} statements`)
          return stmts
        })
        .map((r) => {
          return db.upsertStatements('resource', r.statements).then(() => r)
        })
        .flatMap((r) => H(r))
        .map((batch) => {
          // Report 1 updated record (many statements)
          var num = 1
          if (options.onUpdate) options.onUpdate(num)
          totalProcessed += num
          log.info(`BibsUpdater#update: Saved batch of ${num} (${batch.statements.length} statements): ${batch.bib.id} (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)
          return batch
        })
        .map((batch) => {
          // sending to s3/kinesis
          return (new KinesisWriter()).write(batch)
        })
        .flatMap((r) => H(r))
        .stopOnError((e) => reject(this.handleError(e, '...')))
        .done(function (err) {
          if (err) log.error(err)
          log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
          resolve(totalProcessed)
        })
    })
  }

  uriFromCache (id) {
    var prefix = id.match(/^[a-z]+/)[0]
    id = id.replace(prefix, '')
    var nyplSource = 'sierra-nypl'
    if (prefix === 'pb') nyplSource = 'recap-PUL'
    if (prefix === 'cb') nyplSource = 'recap-COL'

    // Fetch from cache:
    return utils.readJson(`./cache/bibs/${nyplSource}/${id}.json`).then((bib) => {
      log.info('BibsUpdater#uriFromCache: Found cached: ' + bib.id)
      bib = BibSierraRecord.from(bib)
      return bib
    }).catch((e) => {
      // Not in cache?
      // Fetch from api:
      return this.bibByApi(nyplSource, id)
        // Not in api? Fetch from shadowcat:
        .catch(() => this.bibByShadowcat(id, true))
    }).then((bib) => {
      log.info('BibsUpdater#uriFromCache: Processing single-item stream: [' + bib.id + ']')
      return this._processBibStream(
        H([bib])
      )
    })
  }

  bibByApi (nyplSource, id) {
    log.info('BibsUpdater#bibByApi: Fetch bib by id: ', id)
    return nyplApi.bib(nyplSource, id)
      .then((bib) => {
        if (bib) return bib
        else return Promise.reject()
      })
      .catch((e) => {
        log.error(`BibsUpdater#bibByApi: Error fetching bib from api ${id}:`)
        return Promise.reject()
      })
  }

  bibByShadowcat (id, save) {
    save = (typeof save) === 'undefined' ? false : save

    return Shadowcat.bib(id).then((bib) => {
      log.info(`BibsUpdater#bibByShadowcat: Got bib via shadowcat ${id}:`)
      // Remove non-marcinjson fields:
      for (var k in bib) {
        if (/:/.test(k)) delete bib[k]
      }
      // Add nyplSource
      bib.nyplSource = 'sierra-nypl'
      return bib
    }).then((bib) => {
      if (save) return this.saveToDisc(bib).then(() => bib)
      else return bib
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
    // console.log('htreads: ', opts.threads)

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
    if (opts.limit) {
      run(opts.offset || 0, opts.limit)
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
        onLog: (str) => {
          return null
        }
      }
      if (opts.disablescreen) {
        delete events.onLog
      }
      opts.offset = msg.start
      opts.limit = msg.total
      ; (new BibsUpdater()).update(Object.assign({}, events, opts))
    })
  }
}

module.exports = BibsUpdater
