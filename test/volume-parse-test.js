/* global describe it */
const expect = require('chai').expect
const { parseVolume } = require('../lib/volume-parser')

describe('volume parsing', () => {
  it('v. 36-37 (Nov. 1965-Oct. 1967)', () => {
    expect(parseVolume('v. 36-37 (Nov. 1965-Oct. 1967)')).to.deep.equal([[36, 37]])
  })
  it('vol. 67 (May-Oct. 1996)', () => {
    expect(parseVolume('vol. 67 (May-Oct. 1996')).to.deep.equal([[67, 67]])
  })
  it('volume 10, no. 1 - 4 (win. - aut. 1976) inde', () => {
    expect(parseVolume('volume 10, no. 1 - 4 (win. - aut. 1976) inde')).to.deep.equal([[10, 10]])
  })
  it('vol 93, no. 3 (autumn 2013)', () => {
    expect(parseVolume('vol 93, no. 3 (autumn 2013)')).to.deep.equal([[93, 93]])
  })
  it('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)', () => {
    expect(parseVolume('v. 6-7 no. 2, 5-v. 8 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')).to.deep.equal([[6, 7], [8, 8]])
  })
  it('v. 6-7 no. 2, 5-v. 8-10 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)', () => {
    expect(parseVolume('v. 6-7 no. 2, 5-v. 8-10 no. 1 (Oct. 1961-Sept./Oct. 1962, May-June/July 1963)')).to.deep.equal([[6, 7], [8, 10]])
  })
  it('returns empty array for strings without obvious volume information', () => {
    expect(parseVolume('')).to.deep.equal([])
    expect(parseVolume('vol')).to.deep.equal([])
    expect(parseVolume('no. a')).to.deep.equal([])
    expect(parseVolume('May-June/July 1963')).to.deep.equal([])
    expect(parseVolume('Sc News Daily monitor (Kampala, Uganda) Dec. 1-25,27-31, 2018')).to.deep.equal([])
  })
  it('matches on a single number', () => {
    expect(parseVolume('23')).to.deep.equal([[23, 23]])
  })
  it('jaarg. 24 (Jan.-June 1967)', () => {
    expect(parseVolume('jaarg. 24 (Jan.-June 1967)')).to.deep.equal([[24, 24]])
  })
  it('rejects volumes beyond the range of ints', () => {
    // This is a volume value just within the accepted int range:
    const maxInt = Math.pow(2, 31) - 1

    expect(parseVolume(`volume ${maxInt}`)).to.deep.equal([[maxInt, maxInt]])

    // This is a volume value just outside accepted int range:
    expect(parseVolume(`volume ${maxInt + 1}`)).to.deep.equal([])

    // This is a volume value outside accepted int range:
    expect(parseVolume('volume 7600010780000')).to.deep.equal([])

    // Should reject only the invalid int:
    expect(parseVolume('volume 1 - 7600010780000')).to.deep.equal([[1, 1]])
  })
})
