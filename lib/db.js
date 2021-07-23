'use strict'

const log = require('loglevel')
const pg = require('pg')

const Creator = require('./models/creator')
const kmsHelper = require('./kms-helper')

// Configure details of connection deferment
// Max time we'll wait for a connection (i.e. for KMS to decrypt connection config)
const CONNECTION_DEFER_TIMEOUT = 100 // ms
// How long to wait between checks if waiting for pool to initialize:
const CONNECTION_DEFER_PAUSE = 10 // ms
// Compute number of tries to make before aborting waiting for pool:
const CONNECTION_DEFER_MAX_CHECKS = CONNECTION_DEFER_TIMEOUT / CONNECTION_DEFER_PAUSE

var clientWrapper

// Convenience instance to get db connections with promise:
class DbClientWrapper {
  connect () {
    // If pool not yet initialized, deduce config, and initialize it:
    if (!this.pool) {
      this.pool = new pg.Pool(this.connectionConfig)
      this.pool.on('error', function (err, client) {
        log.error('Error in connection pool: ', err)
      })
    }

    // We needn't wait for a connection before resolving because this.pool now
    // has the interface necessary for issuing queries
    return Promise.resolve(this.pool)
  }

  /**
   * Defer resolving a db connection (pool instance) because there's an existing connection being attempted
   */
  _deferredConnect (checkNumber) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.pool) console.log('resolving poool!', this.pool)
        // Has this.pool been instantiated? Resolve it:
        if (this.pool) return resolve(this.pool)
        // Have we exhausted allowed checks?
        else if (checkNumber >= CONNECTION_DEFER_MAX_CHECKS) return reject(new Error('Deferred connect timeout'))
        // Recurse!
        else return this._deferredConnect(checkNumber + 1)
      }, CONNECTION_DEFER_PAUSE)
    })
  }

  // Fetches db creds from KMS if they haven't already been fetched and decrypted
  _extractCredentialsFromEnv () {
    if (this.connectionConfig) return Promise.resolve()

    // Grab DISCOVERY_STORE_CONNECTION_URI from env and decrypt it:
    return kmsHelper.decryptDbCreds().then((decrypted) => {
      this.setConnectionString(decrypted)
    })
  }

  // Set connection creds by URI:
  setConnectionString (uri) {
    const params = new URL(uri)
    this.connectionConfig = {
      user: params.username,
      password: params.password,
      host: params.hostname,
      port: params.port,
      database: params.pathname.split('/')[1],
      application_name: 'discovery-store-poster#v0.0.1',
      max: 20, // max number of clients in the pool
      idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
    }
  }

  disconnect () {
    // TODO deprecating this because now using pg.pool. Need to investigate client release
    return false
    /*
    return this.client.end((err) => {
      if (!err) {
        log.debug('Disconnected DB')
        this.client = null
      } else {
        log.error('Error disconnecting DB: ', err)
      }
    })
    */
  }
}
clientWrapper = new DbClientWrapper()

const tripleSchema = {
  subject_id: { type: 'text', size: 100, key: true },
  predicate: { type: 'text', size: 50, key: true },
  object_id: { type: 'text', size: 512 },
  object_literal: { type: 'text' },
  object_type: { type: 'text', size: 50 },
  object_label: { type: 'text' },
  source_id: { type: 'int', size: 20 },
  source_record_id: { type: 'text', size: 50 },
  source_record_path: { type: 'text', size: 50 },
  creator_id: { type: 'int', key: true },
  index: { type: 'int', key: true },
  created: { type: 'date', time: true }
}

const creatorSchema = {
  id: { type: 'int', key: true, serial: true },
  name: { type: 'text', size: 100 }
}

var setConnectionString = (dburi) => clientWrapper.setConnectionString(dburi)
var disconnect = () => clientWrapper.disconnect()
var connect = () => clientWrapper.connect()

var upsertStatements = (type, records) => {
  const _startTime = new Date()
  log.debug(`DB: upsertStatements start: ${records.length} records`)
  return Promise.all(records.map((record) => upsertStatement(type, record)))
    .then((res) => {
      log.debug(`DB: upsertStatements end: ${records.length} records, ${(new Date()) - _startTime}ms}`)
      return res
    })
}

// Given a sql string with named columns , returns a hash with:
//  - query: new sql string with numbered cols
//  - values: a flat, uniqued array suitable for passing to db with new sql string
var namedQueryToNumbered = (sql, hash) => {
  var values = []
  var propIndex = []

  var query = '' + sql
  sql.match(/\$\{[a-z_]+\}/g).forEach((m) => {
    var prop = m.substring(2, m.length - 1)
    var val = hash[prop]
    if ((typeof val) === 'undefined') val = null

    if (propIndex.indexOf(prop) < 0) {
      values[propIndex.length] = val
      propIndex.push(prop)
    }
    var ind = propIndex.indexOf(prop) + 1

    query = query.replace(m, `$${ind}`)
  })

  return { query, values }
}

var upsertStatement = (type, record) => {
  return upsert(record, tripleSchema, `${type}_statement`)
}

var upsert = (record, schema, tableName) => {
  return clientWrapper.connect().then((client) => {
    if (!client) console.error('client null: ', client)
    return new Promise((resolve, reject) => {
      var sql = upsertSqlBySchema(schema, tableName)
      var parameterized = namedQueryToNumbered(sql, record)

      return client.query(parameterized.query, parameterized.values, function (err, rows) {
        if (err) log.error('err w/queryPrepared: ', err)
        if (err) reject(err)
        else resolve()
      })
    })
  })
}

var upsertSqlBySchema = (schema, tableName) => {
  var pkColumns = Object.keys(schema).filter((prop) => schema[prop].key)

  var updateCols = Object.keys(schema)
    .filter((prop) => !schema[prop].key)
    .map((prop) => {
      var v = `\${${prop}}`
      if (prop === 'created') v = 'NOW()'
      return `${prop}=${v}`
    })
    .join(', ')
  return [
    `INSERT INTO ${tableName}`,
    `(${Object.keys(schema).join(', ')})`,
    'VALUES',
    `(${Object.keys(schema).map((k) => k === 'created' ? 'NOW()' : `\${${k}}`).join(', ')})`,
    `ON CONFLICT(${pkColumns.join(', ')})`,
    'DO UPDATE SET',
    updateCols
  ].join(' ')
}

var getStatement = (type, subjectId, predicate) => {
  var tableName = `${type}_statement`
  return getOne(`SELECT * FROM ${tableName} WHERE subject_id = $1 AND predicate = $2 LIMIT 1`, [subjectId, predicate])
}

var getStatements = (type, subjectId) => {
  var tableName = `${type}_statement`
  return getMany(`SELECT * FROM ${tableName} WHERE subject_id = $1`, [subjectId]).then((s) => {
    log.debug('db.getStatements(' + type + ', ' + subjectId + ') => ', s)
    return s
  })
}

var getStatementsWhere = (type, match) => {
  var tableName = `${type}_statement`
  var matchingClause = Object.keys(match).map((prop) => `${prop} = \${${prop}}`)
  var sql = `SELECT * FROM ${tableName} WHERE ${matchingClause}`
  var parameterized = namedQueryToNumbered(sql, match)
  return getMany(parameterized.query, parameterized.values)
}

var getStatementsFor = (type, predicate, match) => {
  /* eslint-disable no-template-curly-in-string */
  var where = ['predicate = ${predicate}']
  if (match.id) where.push('object_id = ${object_id}')
  else where.push('object_literal = ${object_literal}')
  /* eslint-enable no-template-curly-in-string */

  var values = { predicate, object_id: match.id, object_literal: match.literal }

  var sql = [
    'SELECT S.* FROM (',
    ` SELECT subject_id FROM ${type}_statement _S`,
    ` WHERE ${where.join(' AND ')}`,
    `) M INNER JOIN ${type}_statement S ON M.subject_id = S.subject_id`
  ].join('\n')
  var parameterized = namedQueryToNumbered(sql, values)
  return getMany(parameterized.query, parameterized.values)
}

var getMany = (sql, values) => getResults(sql, values, true)
var getOne = (sql, values) => getResults(sql, values, false)
var execute = (sql, values) => getResults(sql, values, true)

var getResults = (sql, values, many) => {
  return clientWrapper.connect().then((client) => {
    return new Promise((resolve, reject) => {
      client.query(sql, values, (err, res) => {
        // pg returns a result like { rows: [..], rowcount: N, fields: [...], etc}
        if (res.command === 'SELECT' && res.rows) res = res.rows
        if (err) reject(err)
        else resolve(many ? res : res[0])
      })
    })
  })
}

var deleteStatements = (tableName, match) => {
  tableName = `${tableName}_statement`
  var matchingClause = Object.keys(match).map((prop) => `${prop} = \${${prop}}`)
  var sql = `DELETE FROM ${tableName} WHERE ${matchingClause}`
  var parameterized = namedQueryToNumbered(sql, match)
  return execute(parameterized.query, parameterized.values)
}

/*
 *  Special delete call to trim extra lingering statements left over from previous serializations.
 *
 *  Given an array of statements (assumed to be same creator)..
 *  this function will delete from the database any old statements identified by
 *   - having an index that exceeds the max index presently being saved
 *   - having a predicate not among those presently being saved
 *
 *  @param {string} tableName Name of table, e.g. 'resource_statement'
 *  @param {array} statements Array of plain objects representing statements to save
 *  @param {string} type String identifying type of resource (bib/item), which is used to identify un-saved predicates
  */
var deleteStaleStatements = (tableName, statements, type) => {
  if (!statements || statements.length === 0) return Promise.resolve()

  const creatorId = statements[0].creator_id
  var subjectsMappedToPredicatesMappedToOffsets = groupStatementsBySubjectPredicateAndMaxIndex(statements)

  tableName = `${tableName}_statement`

  // For each subject..
  var subjectMatches = Object.keys(subjectsMappedToPredicatesMappedToOffsets).map((subjectId) => {
    // Group distinct indexes
    const predicates = Object.keys(subjectsMappedToPredicatesMappedToOffsets[subjectId])
    var distinctIndexes = predicates.reduce((h, predicate) => {
      var index = subjectsMappedToPredicatesMappedToOffsets[subjectId][predicate]
      if (!h[index]) h[index] = []
      h[index].push(predicate)
      return h
    }, {})

    // We now have a map that maps max-index values to an array of predicates
    //
    // e.g. distinctIndexes[0] => ['dcterms:title', 'nypl:suppressed', 'dc:contributor']
    // .. Which means, for example, the maximum `index` of any 'dcterms:title' statement we're saving is 0
    // .. Which means we want to delete any 'dcterms:title' with `index` > 0 (because it's old)

    // We also want to issue a DELETE on any old predicates we may have saved for this subject in the past:
    // By setting max-index to -1, we effectively delete all statements with these
    // predicates (because all statements have index 0..N)
    distinctIndexes[-1] = unusedPredicates(predicates, type)

    // Get predicate-index specific clauses:
    var predIndexClauses = Object.keys(distinctIndexes).map((index) => {
      var preds = distinctIndexes[index]
      preds = preds.map((p) => `'${p}'`).join(', ')
      return `predicate IN (${preds}) AND index > ${index}`
    }).map((c) => `(${c})`).join(' OR ')

    return `subject_id = '${subjectId}' AND (${predIndexClauses})`
  }).map((subjectMatch) => `(${subjectMatch})`)

  // Two top-level clauses: 1) creator_id
  var matchingClauses = [`creator_id = ${creatorId}`]

  // .. and 2) a bunch of subject-predicate-index matches:
  matchingClauses.push(`(${subjectMatches.join('\n OR ')})`)

  var sql = `DELETE FROM ${tableName} WHERE ${matchingClauses.join(' AND ')}`
  return execute(sql, []).then((res) => {
    // Log if any deleted (should be uncommon)
    if (res.rowCount) log.info('Deleted ' + res.rowCount + ' stale statements')
    return res
  })
}

/*
 *  Special grouping utility function
 *  Given an array of statements, returns a hash consisting of:
 *    {
 *      [subject_id1]: {
 *        [predicate1]: [maxindex1],
 *        [predicate2]: [maxindex2],
 *        ...
 *      },
 *      ...
 *    }
*/
var groupStatementsBySubjectPredicateAndMaxIndex = (statements) => {
  var grouped = statements.reduce((grouped, statement) => {
    if (!grouped[statement.subject_id]) grouped[statement.subject_id] = {}

    grouped[statement.subject_id][statement.predicate] = Math.max(grouped[statement.subject_id][statement.predicate] || 0, statement.index)
    return grouped
  }, {})
  return grouped
}

/*
 * Get array of predicates not represented by statements based on known predicates mapped for type.
 *
 * @param {array} usedPredicates Array of predicate strings being used
 * @param {string} type Either 'bib' or 'item'
 *
 * This is useful for identifying what is missing from:
 *   1) the world of all predicates we ever save for a subject and
 *   2) the predicates we're presently saving for one (usedPredicates)
 *
 * What remains is the set of predicates we are *not* currently saving,
 * which identify statements about this subject that we may wish to delete.
 */
var unusedPredicates = (usedPredicates, type) => {
  // Get all predicates currently involved in mapping:
  let allPredicates = require('./field-mapper')(type).allPredicates()

  // TODO We need to make this automatic. Should identify all predicates used
  // for a given type (bib, item, holding, note, etc) and delete anything previously
  // created for a given subject by this creator.
  // For now, we'll just collect the predicates here that we know to be stale
  // in most clases
  // Add deprecated predicates previously used, but no longer found in mapping here:
  allPredicates = allPredicates.concat(['skos:note', 'rdf:type'])

  // Calculate unused preds as those in `allPredicates` not found in `usedPredicates`
  return allPredicates.filter((predicate) => usedPredicates.indexOf(predicate) < 0)
}

const ENTITY_TYPES = ['resource']

var createDb = (recreate) => {
  var _create = () => {
    var creators = ENTITY_TYPES.map((type) => createTable(`${type}_statement`, tripleSchema))
    creators.push(createTable('creator', creatorSchema))

    return Promise.all(creators)
  }

  var _destroy = () => {
    console.log('Recreating db')
    return Promise.all(
      ENTITY_TYPES
        .map((name) => execute(`DROP TABLE IF EXISTS ${name}_statement`))
    )
  }

  if (recreate) {
    return _destroy().then(_create).catch((e) => log.error('DB create error: ', e))
  } else return _create().catch((e) => log.error('DB create error: ', e))
}

var getStats = () => {
  return Promise.all(
    ENTITY_TYPES.map((type) => {
      return getOne(`SELECT COUNT(*) FROM ${type}_statement WHERE predicate = 'rdf:type'`)
        .then((result) => ({ count: result.count, type }))
    })
  )
}

var createTable = (name, schema) => {
  var pk = []
  var colDeclarations = Object.keys(schema).map((prop) => {
    var type = null
    var spec = schema[prop]
    if (spec.key) pk.push(prop)
    switch (spec.type) {
      case 'text':
        type = 'TEXT'
        if (spec.size) type = `VARCHAR(${spec.size})`
        break
      case 'date':
        type = 'DATE'
        if (spec.time) type = 'TIMESTAMP'
        break
      case 'int':
        type = 'INT'
        break
    }
    if (spec.key) type += ' NOT NULL'
    return `${prop} ${type}`
  })
  if (pk.length > 0) {
    colDeclarations.push(`PRIMARY KEY (${pk.join(', ')})`)
  }
  var sql = `CREATE TABLE IF NOT EXISTS ${name} (${colDeclarations.join(', ')})`
  return execute(sql)
}

var initializeData = () => {
  var commands = []
  commands = commands.concat(
    Object.keys(Creator)
      .filter((k) => /^[A-Z_]+$/.test(k))
      .map((k) => Creator[k])
      .map((c) => upsert(c, creatorSchema, 'creator'))
  )
  return Promise.all(commands)
}

module.exports = { connect, disconnect, setConnectionString, upsertStatement, upsertStatements, createDb, getStatements, getStatement, getStatementsFor, getStatementsWhere, deleteStatements, deleteStaleStatements, getStats, initializeData }
