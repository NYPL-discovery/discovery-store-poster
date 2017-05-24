'use strict'

const log = require('loglevel')
const url = require('url')
const pg = require('pg')

const Creator = require('./models/creator')
const kmsHelper = require('./kms-helper')

var clientProm

// Convenience instance to get db connections with promise:
class DbClientPromise {
  connect () {
    if (this.client) return Promise.resolve(this.client)

    return this._setCreds().then(() => {
      return new Promise((resolve, reject) => {
        this.client = new pg.Client(this.connectionConfig)
        log.debug('Connecting to DB..')
        this.client.connect((err) => {
          if (err) {
            log.error('Db connect error: ', err)
            reject()
          } else {
            log.debug('✅ Connected to DB')
            resolve(this.client)
          }
        })
      })
    })
  }

  // Fetches db creds from KMS if they haven't already been fetched and decrypted
  _setCreds () {
    if (this.connectionConfig) return Promise.resolve()

    // Grab DISCOVERY_STORE_CONNECTION_URI from env and decrypt it:
    return kmsHelper.decryptDbCreds().then((decrypted) => {
      this.setConnectionString(decrypted)
    })
  }

  // Set connection creds by URI:
  setConnectionString (uri) {
    const params = url.parse(uri)
    const auth = params.auth.split(':')
    this.connectionConfig = {
      user: auth[0],
      password: auth[1],
      host: params.hostname,
      port: params.port,
      database: params.pathname.split('/')[1]
    }
  }
}
clientProm = new DbClientPromise()

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

var setConn = (dburi) => clientProm.setConnectionString(dburi)

var upsertStatements = (type, records) => {
  return Promise.all(records.map((record) => upsertStatement(type, record)))
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

    query = query.replace(m, `\$${ind}`)
  })

  return { query, values }
}

var upsertStatement = (type, record) => {
  return upsert(record, tripleSchema, `${type}_statement`)
}

var upsert = (record, schema, tableName) => {
  // return pool.connect().catch((e) => console.error(e)).then((client) => {
  return clientProm.connect().then((client) => {
    if (!client) console.error('client null: ', client)
    return new Promise((resolve, reject) => {
      var sql = upsertSqlBySchema(schema, tableName)
      var parameterized = namedQueryToNumbered(sql, record)

      // TODO : Use a client that supports prepared statements maybe!
      // return queryPrepared(client, `upsert_${tableName}`, parameterized.query, parameterized.values, function (err, rows) {
      return client.query(parameterized.query, parameterized.values, function (err, rows) {
        if (err) log.error('err w/queryPrepared: ', err)
        if (err) reject(err)
        else resolve()
      })
    })
  })
}

/*
// TODO : Use a client that supports prepared statements maybe!
// Given a connected client, runs named prepared statement, creating it if needed:
var queryPrepared = (client, name, sql, values, cb) => {
  // Attach hash to client indicating what prepared statements it knows about:
  if (!client.__preparedStatements) client.__preparedStatements = {}
  // Throw big error if attempting to run same prepared statement name with different sql
  if (client.__preparedStatements[name] && client.__preparedStatements[name] !== sql) throw new Error('Attempt to modify an existing prepared statement: ' + name)

  // This runs the query once it has been prepared:
  var _execPrepared = () => client.execute(name, values, cb)

  // If already prepared for this client, run it:
  if (client.__preparedStatements[name]) _execPrepared()
  else {
    // ..Otherwise, prepare it and then run it:
    client.prepare(name, sql, values.length, function (err) {
      if (err) console.log('err w/prepare: ', err)

      client.__preparedStatements[name] = sql
      _execPrepared()
    })
  }
}
*/

var upsertSqlBySchema = (schema, tableName) => {
  var pkColumns = Object.keys(schema).filter((prop) => schema[prop].key)

  var updateCols = Object.keys(schema).filter((prop) => !schema[prop].key && ['created'].indexOf(prop) < 0).map((prop) => `${prop}=\${${prop}}`).join(', ')
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
  var where = ['predicate = ${predicate}']
  if (match.id) where.push('object_id = ${object_id}')
  else where.push('object_literal = ${object_literal}')

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
  return clientProm.connect().then((client) => {
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
 *  Given an array of statements (assumed to be same creator)
 *  This function will delete from the database any statements that exceed the index for each subject-predicate pair
  */
var deleteStaleStatements = (tableName, statements) => {
  var creator_id = statements[0].creator_id
  var subjectsMappedToPredicatesMappedToOffsets = groupStatementsBySubjectPredicateAndMaxIndex(statements)

  tableName = `${tableName}_statement`

  // For each subject..
  var subjectMatches = Object.keys(subjectsMappedToPredicatesMappedToOffsets).map((subject_id) => {
    // Group distinct indexes
    var distinctIndexes = Object.keys(subjectsMappedToPredicatesMappedToOffsets[subject_id]).reduce((h, predicate) => {
      var index = subjectsMappedToPredicatesMappedToOffsets[subject_id][predicate]
      if (!h[index]) h[index] = []
      h[index].push(predicate)
      return h
    }, {})
    // Get predicate-index specific clauses:
    var predIndexClauses = Object.keys(distinctIndexes).map((index) => {
      var preds = distinctIndexes[index]
      preds = preds.map((p) => `'${p}'`).join(', ')
      return `predicate IN (${preds}) AND index > ${index}`
    }).map((c) => `(${c})`).join(' OR ')

    return `subject_id = '${subject_id}' AND (${predIndexClauses})`
  }).map((subjectMatch) => `(${subjectMatch})`)

  // Two top-level clauses: 1) creator_id
  var matchingClauses = [`creator_id = ${creator_id}`]

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

const ENTITY_TYPES = ['resource', 'organization', 'location', 'status', 'datasource', 'accessmessage', 'catalogitemtype']

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
  console.log('cmds: ', Object.keys(Creator).filter((k) => /^[A-Z_]+$/.test(k)))
  return Promise.all(commands)
}

module.exports = { setConn, upsertStatement, upsertStatements, createDb, getStatements, getStatement, getStatementsFor, getStatementsWhere, deleteStatements, deleteStaleStatements, getStats, initializeData }
