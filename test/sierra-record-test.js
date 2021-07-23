/* global describe it */

const expect = require('chai').expect

const SierraRecord = require('./../lib/models/sierra-record')

describe('SierraRecord', function () {
  describe('constructor', function () {
    it('initializes NYPL SierraRecord based on Sierra marcinjson', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      expect(record.isNyplRecord()).to.eq(true)
      expect(record.isPartnerRecord()).to.eq(false)

      // Get callnumber
      const callNum = record.varField('852', ['h'])
      expect(callNum).to.be.a('array')
      expect(callNum[0]).to.eq('*ONR 84-743')
    })

    it('initializes partner "SierraRecord" based on SCSB marcinjson', function () {
      const record = new SierraRecord(require('./data/bib-hl-990000453050203941.json'))
      expect(record.isPartnerRecord()).to.eq(true)

      // Get title
      const title = record.varField('245', ['a', 'b', 'c'])
      expect(title).to.be.a('array')
      expect(title[0]).to.eq('ʻOrekh ha-din be-Yiśraʾel : maʻamado, zekhuyotaṿ ṿe-ḥovotaṿ : leḳeṭ dinim ṿe-halakhot / ba-ʻarikhat S. Ginosar.')
    })
  })
})
