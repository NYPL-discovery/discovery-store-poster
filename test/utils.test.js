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
      expect(output).to.deep.equal(['b100', 'b200', 'b300'])
    })
  })

  describe('removeTrailingElementsMatching', () => {
    it('remove objects with empty .value property', () => {
      const emptyValue = (v) => v.value === ''

      const input1 = [{ marc: 100, value: '' }, { marc: 101, value: '' }]
      const res1 = utils.removeTrailingElementsMatching(input1, emptyValue)
      expect(res1).to.deep.equal([])

      const input2 = [{ marc: 100, value: '' }, { marc: 100, value: 'one' }]
      const res2 = utils.removeTrailingElementsMatching(input2, emptyValue)
      expect(res2).to.deep.equal(input2)

      const input3 = [
        { marc: 100, value: 'one' },
        { marc: 100, value: 'two' },
        { marc: 100, value: '' },
        { marc: 100, value: 'three' },
        { marc: 100, value: '' },
        { marc: 100, value: '' }
      ]
      const res3 = utils.removeTrailingElementsMatching(input3, emptyValue)
      expect(res3).to.deep.equal(input3.slice(0, 4))
    })
  })

  describe('trimTrailingPunctuation', () => {
    it('removes trailing slash', () => {
      expect(utils.trimTrailingPunctuation('foo/')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo /')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo / ')).to.eq('foo')
    })

    it('removes trailing colon', () => {
      expect(utils.trimTrailingPunctuation('foo:')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo :')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo : ')).to.eq('foo')
    })

    it('removes trailing comma', () => {
      expect(utils.trimTrailingPunctuation('foo,')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo ,')).to.eq('foo')
      expect(utils.trimTrailingPunctuation('foo ,  ')).to.eq('foo')
    })
  })
})
