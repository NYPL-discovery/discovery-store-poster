/* global describe it */

const assert = require('assert')

var Status = require('../lib/models/Status')

describe('DB', function () {
  this.timeout(1000)

  describe('status by id', function () {
    it('fetch status by id', function () {
      return Status.byId('a')
        .then(function (status) {
          assert.ok(status)
          assert.equal(status.literal('skos:prefLabel'), 'Available')
        })
    })
  })

  describe('status by code', function () {
    it('fetch status by code', function () {
      return Status.byCode('-')
        .then(function (statuses) {
          assert.ok(statuses)
          assert.equal(statuses.length, 2)
        })
    })
  })

  describe('status by prefLabel', function () {
    it('fetch status by preflabel', function () {
      return Status.byLabel('Use in library')
        .then(function (statuses) {
          assert.ok(statuses)
          assert.equal(statuses.length, 1)
        })
    })
  })
})
