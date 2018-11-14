const expect = require('chai').expect
const SierraRecord = require('./../lib/models/bib-sierra-record')

describe('SierraRecord', function () {
  describe('varFields', function () {
    const data = {
      'varFields': [
        {
          'fieldTag': 'b',
          'marcTag': '700',
          'ind1': '1',
          'ind2': ' ',
          'content': null,
          'subfields': [
            {
              'tag': 'a',
              'content': 'Bird, Brad,'
            },
            {
              'tag': 'd',
              'content': '1957-'
            },
            {
              'tag': 'e',
              'content': 'screenwriter,'
            },
            {
              'tag': 'e',
              'content': 'film director,'
            },
            {
              'tag': 'e',
              'content': 'voice actor.'
            }
          ]
        },
        {
          'fieldTag': 'b',
          'marcTag': '700',
          'ind1': '1',
          'ind2': ' ',
          'content': null,
          'subfields': [
            {
              'tag': 'a',
              'content': 'Bird, Brad, [second varfield]'
            },
            {
              'tag': 'e',
              'content': 'voice actor. [second varfield]'
            }
          ]
        }
      ]
    }
    const record = new SierraRecord(data)

    it('should extract single var field', function () {
      const val = record.varField('700', 'd')
      expect(val).to.be.a('array')
      expect(val[0]).to.equal('1957-')
    })

    it('should extract repeated var field, repeated subfield', function () {
      const val = record.varField('700', 'e')
      expect(val).to.be.a('array')
      expect(val[0]).to.equal('screenwriter, film director, voice actor.')
      expect(val[1]).to.equal('voice actor. [second varfield]')
    })

    it('should extract repeated var field with custom joiner', function () {
      const val = record.varField('700', 'e', { subfieldJoiner: '-sassafras-' })
      expect(val).to.be.a('array')
      expect(val[0]).to.equal('screenwriter,-sassafras-film director,-sassafras-voice actor.')
      expect(val[1]).to.equal('voice actor. [second varfield]')
    })

    it('should extract map of subfields when tagSubfields is true', function () {
      const val = record.varField('700', ['a', 'e'], { tagSubfields: true })
      expect(val).to.be.a('array')
      expect(val[0]).to.include({ a: 'Bird, Brad,', e: 'screenwriter, film director, voice actor.' })
      expect(val[1]).to.include({ a: 'Bird, Brad, [second varfield]', e: 'voice actor. [second varfield]' })
    })

    it('should extract repeated subfield as multiple values when joinSubfields is false', function () {
      const val = record.varField('700', 'e', { joinSubfields: false })
      expect(val).to.be.a('array')
      expect(val).to.include.members(['screenwriter,', 'film director,', 'voice actor.', 'voice actor. [second varfield]'])
    })

    it('should extract repeated subfields inline with nonrepeated subfields when joinSubfields is false [somewhat outside usecase]', function () {
      const val = record.varField('700', ['a', 'e'], { joinSubfields: false })
      expect(val).to.be.a('array')
      expect(val).to.include.members(['Bird, Brad,', 'screenwriter,', 'film director,', 'voice actor.', 'Bird, Brad, [second varfield]', 'voice actor. [second varfield]'])
    })
  })
})
