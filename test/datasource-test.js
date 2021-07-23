/* global describe it */

const expect = require('chai').expect

const Datasource = require('./../lib/models/datasource')

describe('Datasource', function () {
  describe('byMarcJsonNyplSource', function () {
    it('should return relevant DataSource for PUL', function () {
      expect(Datasource.byMarcJsonNyplSource('recap-pul')).to.be.a('Object')
      expect(Datasource.byMarcJsonNyplSource('recap-pul').id).to.eq(10011)
    })

    it('should return relevant DataSource for CUL', function () {
      expect(Datasource.byMarcJsonNyplSource('recap-cul')).to.be.a('Object')
      expect(Datasource.byMarcJsonNyplSource('recap-cul').id).to.eq(10012)
    })

    it('should return relevant DataSource for NYPL', function () {
      expect(Datasource.byMarcJsonNyplSource('sierra-nypl')).to.be.a('Object')
      expect(Datasource.byMarcJsonNyplSource('sierra-nypl').id).to.eq(10004)
    })

    it('should return relevant DataSource for HL', function () {
      expect(Datasource.byMarcJsonNyplSource('recap-hl')).to.be.a('Object')
      expect(Datasource.byMarcJsonNyplSource('recap-hl').id).to.eq(10013)
    })
  })
})
