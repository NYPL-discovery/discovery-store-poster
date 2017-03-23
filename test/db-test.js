/* global describe it */

const assert = require('assert')

var db = require('../lib/db')
const kmsHelper = require('../lib/kms-helper')

describe('DB', function () {
  this.timeout(1000)

  describe('create record', function () {
    it('create, delete record', function () {
      var testStatement = {subject_id: 'testsubject123', predicate: 'test:predicate', object_id: 'testobject456', index: 0, source: 'recap-PUL', source_record_id: 'source987', creator_id: -1}

      return kmsHelper.decryptDbCreds()
        .then((connectionUri) => db.setConn(connectionUri))
        .then(() => {
          // Create test statement
          return db.upsertStatement('resource', testStatement)
            // confirm saved:
            .then(() => db.getStatements('resource', testStatement.subject_id))
            .then(function (statements) {
              assert.ok(statements)
              assert.ok(statements[0])
              assert.equal(statements[0].predicate, testStatement.predicate)
              assert.equal(statements[0].object_id, testStatement.object_id)
            })
            // delete statement
            .then(() => db.deleteStatements('resource', { subject_id: testStatement.subject_id }))
            // confirm deleted:
            .then(() => db.getStatements('resource', { subject_id: testStatement.subject_id }))
            .then(function (statements) {
              assert.equal(statements.length, 0)
            })
        }).catch((e) => {
          console.log('error: ', e)
          throw e
        })
    })
  })
})
