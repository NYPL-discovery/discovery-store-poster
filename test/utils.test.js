/* global describe it */

const Statement = require('../lib/models/statement')
const utils = require('../lib/utils')
const expect = require('chai').expect

describe('Utils', function () {
  describe('distinctSubjectIds', function () {
    it('returns distinct subjectIds', function () {
      // Build an array of Statement instances from some subject_ids:
      const statements = ['b100', 'b200', 'b300', 'b300', 'b100#1.0001']
        .map((bnum) => new Statement({ subject_id: bnum, predicate: 'fake:pred', object_id: 'fake:objectid' }))
      const output = utils.distinctSubjectIds(statements)
      expect(output).to.be.a('array')
      expect(output).to.have.members(['b100', 'b200', 'b300'])
    })
  })
})
