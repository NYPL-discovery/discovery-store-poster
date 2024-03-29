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

  describe('varField', function () {
    it('able to return tagged subfields', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      // Get title using all subfields
      const title = record.varField('245', null, { tagSubfields: true })
      expect(title).to.be.a('array')
      expect(title[0]).to.deep.equal({
        a: 'Niwtʻer azgayin patmutʻian hamar',
        b: 'Ereveli hay kazunkʻ ; Parskastan /',
        c: 'Ashkhatasirutʻiamb Galust Shermazaniani.'
      })
    })

    it('able to return tagged subfields with certain subfields excluded', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      // Get title using all subfields
      const title = record.varField('245', null, { tagSubfields: true, excludedSubfields: ['b'] })
      expect(title).to.be.a('array')
      expect(title[0]).to.deep.equal({
        a: 'Niwtʻer azgayin patmutʻian hamar',
        c: 'Ashkhatasirutʻiamb Galust Shermazaniani.'
      })
    })

    it('able to return single string from all subfields', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      // Get title using all subfields
      const title = record.varField('245')
      expect(title).to.be.a('array')
      expect(title[0]).to.eq('Niwtʻer azgayin patmutʻian hamar Ereveli hay kazunkʻ ; Parskastan / Ashkhatasirutʻiamb Galust Shermazaniani.')
    })

    it('able to return single string from all subfields, excluding some subfields', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      // Get title using all subfields
      const title = record.varField('245', null, { excludedSubfields: ['b'] })
      expect(title).to.be.a('array')
      expect(title[0]).to.eq('Niwtʻer azgayin patmutʻian hamar Ashkhatasirutʻiamb Galust Shermazaniani.')
    })

    it('able to return single string from certain subfields', function () {
      const record = new SierraRecord(require('./data/bib-10001936.json'))
      // Get title using all subfields
      const title = record.varField('245', ['a', 'c'])
      expect(title).to.be.a('array')
      expect(title[0]).to.eq('Niwtʻer azgayin patmutʻian hamar Ashkhatasirutʻiamb Galust Shermazaniani.')
    })
  })

  describe('parallel', function () {
    it('extracts correct text direction when record has multiple parallels with different text directions', function () {
      const record = new SierraRecord(require('./data/bib-11606020.json'))

      const parallelTitle = record.parallel('245', ['a', 'b'])
      expect(parallelTitle).to.be.a('array')
      // This asserts that there is no leading '\u200F' at the start of the
      // title property, confirming a bug fix related to this record, where
      // the extracted 'rtl' text direction of one 880 was incorrectly applied
      // to a different 880 that should have been tagged 'ltr'
      expect(parallelTitle[0]).to.eq('ספר תולדות ישו = The gospel according to the Jews, called Toldoth Jesu : the generations of Jesus, now first translated from the Hebrew.')
    })
  })
})
