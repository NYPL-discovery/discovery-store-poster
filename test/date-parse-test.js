/* global describe it */
const expect = require('chai').expect
const { parseDatesAndCache, checkCache, private: { _parseDates, _has4DigitYear } } = require('../lib/date-parse')
const serialBibs = require('./data/date-parse-bibs/v-bibs.json')
const mixedBibs = require('./data/date-parse-bibs/mixed-bibs.json')

describe('dateParser Lambda', () => {
  describe('caching', () => {
    it('caches parsed dates for bibs with fieldtagvs @local-only', async () => {
      await parseDatesAndCache(serialBibs)
      expect(checkCache('v. 36-37 (Nov. 1965-Oct. 1967)')).to.deep.equal([['1965-11', '1967-10']])
      expect(checkCache('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')).to.deep.equal([['1961-10', '1962-10'], ['1963-05', '1963-07']])
      expect(checkCache('1992:Feb.-Mar.')).to.deep.equal([['1992-02', '1992-03']])
    })
    it('can handle bibs with and without fieldtagvs @local-only', async () => {
      await parseDatesAndCache(mixedBibs)
      const fieldtagvs = ['v. 36-37 (Nov. 1965-Oct. 1967)', '1992:Feb.-Mar.', 'v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)']
      const cachedParsedValues = fieldtagvs.map((tag) => {
        return checkCache(tag)
      })

      expect(cachedParsedValues).to.deep.equal([[['1965-11', '1967-10']], [['1992-02', '1992-03']], [['1961-10', '1962-10'], ['1963-05', '1963-07']]])
    })
  })

  describe('correcly parses a variety of fieldtagvs', () => {
    it('v. 36-37 (Nov. 1965-Oct. 1967) @local-only', async () => {
      const fieldtagv = 'v. 36-37 (Nov. 1965-Oct. 1967)'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1965-11', '1967-10']])
    })
    it('1992:Feb.-Mar. @local-only', async () => {
      const fieldtagv = '1992:Feb.-Mar.'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1992-02', '1992-03']])
    })
    it('May 1, 1888 - Aug 31, 1888 @local-only', async () => {
      const fieldtagv = 'May 1, 1888 - Aug 31, 1888'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1888-05-01', '1888-08-31']])
    })
    it('1969-76 @local-only', async () => {
      const fieldtagv = '1969-76'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1969', '1976']])
    })
    it('Jan.-Dec. 1967 @local-only', async () => {
      const fieldtagv = 'Jan.-Dec. 1967'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1967-01', '1967-12']])
    })
    it('1964-65 @local-only', async () => {
      const fieldtagv = '1964-65'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1964', '1965']])
    })
    it('1906-09 @local-only', async () => {
      const fieldtagv = '1906-09'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1906', '1909']])
    })
    it('2006-09 @local-only', async () => {
      const fieldtagv = '2006-09'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['2006', '2009']])
    })
    it('Jan. 2, 1964-July 29, 1965 @local-only', async () => {
      const fieldtagv = 'Jan. 2, 1964-July 29, 1965'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1964-01-02', '1965-07-29']])
    })
    it('Nov. 1965-Oct. 1967 @local-only', async () => {
      const fieldtagv = 'Nov. 1965-Oct. 1967'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1965-11', '1967-10']])
    })
    it('1992:Feb.-Mar @local-only', async () => {
      const fieldtagv = '1992:Feb.-Mar'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1992-02', '1992-03']])
    })
    it('1904/1905 @local-only', async () => {
      const fieldtagv = '1904/1905'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1904', '1905']])
    })
    it('1951/52-1959/60 @local-only', async () => {
      const fieldtagv = '1951/52-1959/60'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1951', '1960']])
    })
    it('1934/1935-1935/1936 @local-only', async () => {
      const fieldtagv = '1934/1935-1935/1936'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1934', '1936']])
    })
    it('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963) @local-only', async () => {
      const fieldtagv = 'v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1961-10', '1962-10'], ['1963-05', '1963-07']])
    })
    it('Aug. 1976 @local-only', async () => {
      const fieldtagv = 'Aug. 1976'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1976-08', '1976-08']])
    })
    it('1992:spring @local-only', async () => {
      const fieldtagv = '1992:spring'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1992-03-20', '1992-06-21']])
    })
    it('v. 93, no. 3 (autumn 2013) @local-only', async () => {
      const fieldtagv = 'v. 93, no. 3 (autumn 2013)'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['2013-09-23', '2013-12-31']])
    })
    it('v. 10, no. 1 - 4 (win. - aut. 1976) inde @local-only', async () => {
      const fieldtagv = 'v. 10, no. 1 - 4 (win. - aut. 1976) inde.'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1976-01-01', '1976-12-31']])
    })
    it('Mar. 1969-Winter 1970 @local-only', async () => {
      const fieldtagv = 'Mar. 1969-Winter 1970'
      const [parsed] = await _parseDates(fieldtagv)
      expect(parsed).to.deep.equal([['1969-03-01', '1970-03-20']])
    })
  })

  describe('_has4DigitYear', () => {
    it('should identify string with a 4 digit year', () => {
      expect(_has4DigitYear('some stuff 1998 other stuff')).to.eq(true)
      expect(_has4DigitYear('1998 other stuff')).to.eq(true)
      expect(_has4DigitYear('some stuff 1998')).to.eq(true)
      expect(_has4DigitYear('1998')).to.eq(true)
      expect(_has4DigitYear('1998-1999')).to.eq(true)
      expect(_has4DigitYear('-1999')).to.eq(true)
      expect(_has4DigitYear('2022.10')).to.eq(true)
    })

    it('should fail string with a number that is not 4 digits', () => {
      expect(_has4DigitYear('some stuff 123')).to.eq(false)
      expect(_has4DigitYear('some stuff 12345')).to.eq(false)
    })
  })
})
