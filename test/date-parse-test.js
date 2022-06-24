/* global describe it */
const expect = require('chai').expect
const { parseDate } = require('../lib/dateParser-lambda')

describe('dateParser Lambda', () => {
  it('v. 36-37 (Nov. 1965-Oct. 1967)', async () => {
    const parsed = await parseDate('v. 36-37 (Nov. 1965-Oct. 1967)')
    expect(parsed).to.deep.equal([['1965-11', '1967-10']])
  })
  it('1992:Feb.-Mar.', async () => {
    const parsed = await parseDate('1992:Feb.-Mar.')
    expect(parsed).to.deep.equal([['1992-02', '1992-03']])
  })
  it('May 1, 1888 - Aug 31, 1888', async () => {
    const parsed = await parseDate('May 1, 1888 - Aug 31, 1888')
    expect(parsed).to.deep.equal([['1888-05-01', '1888-08-31']])
  })
  it('1969-76', async () => {
    const parsed = await parseDate('1969-76')
    expect(parsed).to.deep.equal([['1969', '1976']])
  })
  it('Jan.-Dec. 1967', async () => {
    const parsed = await parseDate('Jan.-Dec. 1967')
    expect(parsed).to.deep.equal([['1967-01', '1967-12']])
  })
  it('1964-65', async () => {
    const parsed = await parseDate('1964-65')
    expect(parsed).to.deep.equal([['1964', '1965']])
  })
  it('1906-09', async () => {
    const parsed = await parseDate('1906-09')
    expect(parsed).to.deep.equal([['1906', '1909']])
  })
  it('2006-09', async () => {
    const parsed = await parseDate('2006-09')
    expect(parsed).to.deep.equal([['2006', '2009']])
  })
  it('Jan. 2, 1964-July 29, 1965', async () => {
    const parsed = await parseDate('Jan. 2, 1964-July 29, 1965')
    expect(parsed).to.deep.equal([['1964-01-02', '1965-07-29']])
  })
  it('Nov. 1965-Oct. 1967', async () => {
    const parsed = await parseDate('Nov. 1965-Oct. 1967')
    expect(parsed).to.deep.equal([['1965-11', '1967-10']])
  })
  it('1992:Feb.-Mar', async () => {
    const parsed = await parseDate('1992:Feb.-Mar')
    expect(parsed).to.deep.equal([['1992-02', '1992-03']])
  })
  it('1904/1905', async () => {
    const parsed = await parseDate('1904/1905')
    expect(parsed).to.deep.equal([['1904', '1905']])
  })
  it('1951/52-1959/60', async () => {
    const parsed = await parseDate('1951/52-1959/60')
    expect(parsed).to.deep.equal([['1951', '1960']])
  })
  it('1934/1935-1935/1936', async () => {
    const parsed = await parseDate('1934/1935-1935/1936')
    expect(parsed).to.deep.equal([['1934', '1936']])
  })
  it('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)', async () => {
    const parsed = await parseDate('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')
    expect(parsed).to.deep.equal([['1961-10', '1962-10'], ['1963-05', '1963-07']])
  })
  // timetwister is not returning what the sheet says
  xit('Aug. 1976', async () => {
    const parsed = await parseDate('Aug. 1976')
    expect(parsed).to.deep.equal([['1976-08', '1976-08']])
  })
  // Waiting on better seasonal support from timetwister
  xit('1992:spring', async () => {
    const parsed = await parseDate('1992:spring')
    expect(parsed).to.deep.equal([['1992-02', '1992-03']])
  })
  xit('v. 93, no. 3 (autumn 2013)', async () => {
    const parsed = await parseDate('v. 93, no. 3 (autumn 2013)')
    expect(parsed).to.deep.equal()
  })
  xit('v. 10, no. 1 - 4 (win. - aut. 1976) inde', async () => {
    const parsed = await parseDate('v. 10, no. 1 - 4 (win. - aut. 1976) inde')
    expect(parsed).to.deep.equal([['1976-01-01', '1976-12-31']])
  })
  xit('Mar. 1969-Winter 1970', async () => {
    const parsed = await parseDate('Mar. 1969-Winter 1970')
    expect(parsed).to.deep.equal([['1969-03', '1970-01']])
  })
})
