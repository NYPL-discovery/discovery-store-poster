/* global describe it */

const assert = require('assert')

var db = require('../lib/db')

describe('DB', function () {
  this.timeout(1000)

  /*
  describe('connect', function () {
    it('can connect to db', function () {
      return db.connect().then(function (cn) {
        assert.ok(cn)
      })
    })
  })
  describe('sync', function () {
    it('can sync schema', function () {
      return db.initialize().then(function () {
        assert.ok(db.models.ResourceStatement)
      })
    })
  })
  */
  describe('create record', function () {
    it('create record', function () {
      return db.upsertStatement('resource_statement', {subject_id: 'testsubject123', predicate: 'test:predicate', object_id: 'testobject456', source: 'recap-PUL', source_record_id: 'source987', creator: 'main-serializer'}).then(function (res) {
        assert.ok(true)
      })
    })
  })
})
