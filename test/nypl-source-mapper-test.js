/* global describe it */

const expect = require('chai').expect

const NyplSourceMapper = require('./../lib/nypl-source-mapper')

describe('NyplSourceMapper', function () {
  const originalCoreVersion = process.env.NYPL_CORE_VERSION

  before(() => {
    process.env.NYPL_CORE_VERSION = 'v1.37a'
  })

  after(() => {
    process.env.NYPL_CORE_VERSION = originalCoreVersion
  })

  describe('instance', function () {
    it('should return instance', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst).to.be.a('object')
    })
  })

  describe('splitIdentifier', function () {
    it('should split sierra-nypl bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('b12082323')).to.be.a('object')
      expect(inst.splitIdentifier('b12082323').type).to.be.eq('bib')
      expect(inst.splitIdentifier('b12082323').nyplSource).to.be.eq('sierra-nypl')
      expect(inst.splitIdentifier('b12082323').id).to.be.eq('12082323')
    })

    it('should split sierra-nypl item identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('i123')).to.be.a('object')
      expect(inst.splitIdentifier('i123').type).to.eq('item')
      expect(inst.splitIdentifier('i123').nyplSource).to.eq('sierra-nypl')
      expect(inst.splitIdentifier('i123').id).to.be.eq('123')
    })

    it('should split recap-pul bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('pb123')).to.be.a('object')
      expect(inst.splitIdentifier('pb123').type).to.eq('bib')
      expect(inst.splitIdentifier('pb123').nyplSource).to.eq('recap-pul')
      expect(inst.splitIdentifier('pb123').id).to.be.eq('123')
    })

    it('should split recap-pul bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('pi123')).to.be.a('object')
      expect(inst.splitIdentifier('pi123').type).to.eq('item')
      expect(inst.splitIdentifier('pi123').nyplSource).to.eq('recap-pul')
      expect(inst.splitIdentifier('pi123').id).to.be.eq('123')
    })

    it('should split recap-cul bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('cb123')).to.be.a('object')
      expect(inst.splitIdentifier('cb123').type).to.eq('bib')
      expect(inst.splitIdentifier('cb123').nyplSource).to.eq('recap-cul')
      expect(inst.splitIdentifier('cb123').id).to.be.eq('123')
    })

    it('should split recap-cul bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('ci123')).to.be.a('object')
      expect(inst.splitIdentifier('ci123').type).to.eq('item')
      expect(inst.splitIdentifier('ci123').nyplSource).to.eq('recap-cul')
      expect(inst.splitIdentifier('ci123').id).to.be.eq('123')
    })

    it('should split recap-hl bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('hb123')).to.be.a('object')
      expect(inst.splitIdentifier('hb123').type).to.eq('bib')
      expect(inst.splitIdentifier('hb123').nyplSource).to.eq('recap-hl')
      expect(inst.splitIdentifier('hb123').id).to.be.eq('123')
    })

    it('should split recap-hl bib identifier', function () {
      const inst = NyplSourceMapper.instance()
      expect(inst.splitIdentifier('hi123')).to.be.a('object')
      expect(inst.splitIdentifier('hi123').type).to.eq('item')
      expect(inst.splitIdentifier('hi123').nyplSource).to.eq('recap-hl')
      expect(inst.splitIdentifier('hi123').id).to.be.eq('123')
    })
  })
})
