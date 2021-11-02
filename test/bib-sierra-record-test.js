const expect = require('chai').expect

const BibSierraRecord = require('./../lib/models/bib-sierra-record')

describe('BibSierraRecord', function () {
  describe('isOtfRecord', function () {
    it('doesn\'t flag non-OTF Bib', function () {
      const record = new BibSierraRecord(require('./data/bib-17295111.json'))

      // Check is-otf:
      expect(record.isOtfRecord()).to.eq(false)
    })

    it('flags OTF Bib based on location', function () {
      const record = new BibSierraRecord(require('./data/bib-22180568-otf.json'))
      expect(record.isNyplRecord()).to.eq(true)
      expect(record.isPartnerRecord()).to.eq(false)

      // Check is-otf:
      expect(record.isOtfRecord()).to.eq(true)
    })

    it('flags OTF Bib based on 910', function () {
      const record = new BibSierraRecord(require('./data/bib-22180848-otf.json'))
      expect(record.isNyplRecord()).to.eq(true)
      expect(record.isPartnerRecord()).to.eq(false)

      // Check is-otf:
      expect(record.isOtfRecord()).to.eq(true)
    })
  })
})
