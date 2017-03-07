'use strict'

const _ = require('highland')

var log = require('loglevel')
const cluster = require('cluster')

const PcdmBibSerializer = require('./pcdm-serializer').PcdmBibSerializer
const db = require('./db')
const utils = require('./utils')
const BibSierraRecord = require('./models/bib-sierra-record')
const ItemSierraRecord = require('./models/item-sierra-record')
const nyplApi = require('./nyplDataApi')
const IndexerRunner = require('./indexer-runner')
const bibSerializer = require('./serializers/bib')
const itemSerializer = require('./serializers/item')
const shadowcatRemediate = require('./shadowcat-remediator')
const SourceLoader = require('./sources/loader')
const Shadowcat = require('./shadowcat')
const config = require('config')
const KinesisWriter = require('./KinesisWriter');

// var bibsSource = new NdJsonSource('./test/data/b1.ndjson')

if (!config.has('bibsSource')) {
  log.error('No bibsSource configured.')
  // process.exit()
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
    process.exit()
  }

  extractStatements (bib) {
    // itemSerializer
    // console.log(bib);

    return Promise.all([
        this.extractElectronicItem(bib).then((item) => item ? itemSerializer.fromElectronicItem(item) : []),
        bibSerializer.fromMarcJson(bib)
      ])
      .then(utils.flattenArray)
      // .then((stmts) => stmts.filter((stmt) => stmt))
      .catch((e) => {
        console.log('error extracting stmts: ', e)
        console.trace(e)
        // return this.saveToDisc(bib).then((r) => {
        //   console.log('Saved problematic bib to disk: ', r.path)
        //   console.log(`  Run with --uri b${bib.id} to test again`)
        // })
      })
  }

  update (options, data) {
    if (options.onLog) {
      log = {
        error: log.error,
        info: () => {},
        debug: () => {}
      }
    }

    // data from ndjson file
    // var stream = bibsSource.stream()
    // data from Kinesis:
    // var stream = (new NdJsonSource(data)).stream();
    // console.log(stream)

    // Apply skip & limit, if given
    // if (options.offset) stream = stream.drop(options.offset)
    // if (options.limit) stream = stream.take(options.limit)

    // var consumed = 0
    // stream = stream
    //   .map((b) => {
    //     consumed += 1
    //     // log.debug('consumed: ', consumed)
    //     return b
    //   })
    //   // .map((b) => this.deserialize(b, avro))
    //   .map((b) => {
    //     // console.log(b)
    //     // console.log(BibSierraRecord.from(b))
    //     return BibSierraRecord.from(b)
    //   })

    var nonstreamBib = BibSierraRecord.from(JSON.parse(data));
    /* stream.each((obj) => {
      console.log('obj: ', obj)
    })*/

    // if (options.seek) stream = stream.filter((r) => '' + r.id === '' + options.seek)
    console.log('got data, about to process.');
    // return this._processBibStream(stream, options)
    return this._processBibKinesis(nonstreamBib, options);
  }

  _processBibKinesis(bib, options) {
    var totalProcessed = 0;

    return new Promise((resolve, reject) => {
      this.extractStatements(bib)
        .then((statements) => ({ statements, bib }))
        .then((stmts) => {
          console.log('got ', stmts.statements.length);
          // console.log('  ', stmts.statements);
          return stmts;
        })
        // .then((stmts) => {
        //   // console.log(stmts);
        //   db
        //     .upsertStatements('resource', stmts.statements)
        //     .then(() => ({ count: stmts.statements.length, bib: stmts.bib }))
        //   return stmts;
        // })
        .then(object => {
          // sending to s3/kinesis
          return (new KinesisWriter).upload(object);
        })
        .then((d) => {
            console.log('success?')
            resolve();
          }, function (err) {
          if (err) log.error(err)
          console.log('done?')
          reject();
          log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
          // process.exit()
        })
        .catch(e => {
          console.log('reject inside _processBibKinesis function', e);
          process.exit();
        })
      });
  }

  _processBibStream (stream, options) {
    if (!options) options = {}
    var totalProcessed = 0
    // console.log(stream);
    stream
      .map((b) => {
        log.debug('Processing bib: ', JSON.stringify(b, null, 2))
        return b
      })
      .map((bib) => this.extractStatements(bib).then((statements) => ({ statements, bib })))
      .flatMap((r) => _(r))
      .map((stmts) => {
        // log.info(`subject: ${stmts[0].subject_id}`)
        log.debug('got ', stmts.statements.length)
        log.debug('  ', stmts.statements)
        // console.log('got bib: ', stmts.bib, stmts.statements.length)
        return stmts
      })
      // .map((r) => {
      //   // console.log(r);
      //   return db.upsertStatements('resource', r.statements).then(() => ({ count: r.statements.length, bib: r.bib }))
      // })
      .flatMap((r) => _(r))
      .map((batch) => {
        // Report 1 updated record (many statements)
        var num = 1
        if (options.onUpdate) options.onUpdate(num)
        totalProcessed += num
        log.info(`BibsUpdater#update: Saved batch of ${num}: ${batch.bib.id} (${totalProcessed} total processed, index ${totalProcessed + options.offset})`)
        return batch
      })
      .stopOnError((e) => this.handleError(e, '...'))
      .done(function (err) {
        if (err) log.error(err)
        console.log('done?')
        log.info(`BibsUpdater#update: Done updating ${totalProcessed} resources (${options.offset || 0}, ${options.limit || '[unbounded]'})`)
        process.exit()
      })
  }

  bibs () {
    log.info('BibsUpdater#bibs: Fetch all')
    return nyplApi.bibs().then((bibs) => {
      log.info('Consuming bibs: ', bibs.length)
      return Promise.all(bibs.map(this._saveBib))
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
        _([bib])
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

  _saveBib (bib, nyplSource) {
    console.log('serializing')
    return this.extractElectronicItem(bib)
      .then(PcdmBibSerializer.serialize)
      .then(shadowcatRemediate)
      .then(this._docSerializationToStatements)
      .then((statements) => {
        console.log('statements: ', statements)

        return Promise.all(statements.map((stmt) => db.upsertStatement('resource_statement', stmt)))
      })
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
